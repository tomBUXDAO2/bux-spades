import { io } from '../../server';
import { games } from '../../gamesStore';
import { trickLogger } from '../../lib/trickLogger';
import prisma from '../../lib/prisma';
import type { Game, GamePlayer } from '../../types/game';

export async function updateStatsAndCoins(game: Game) {
  console.log('[STATS UPDATE] Starting stats and coin update for game:', game.id);
  
  if (!game.dbGameId) {
    console.log('[STATS UPDATE] No dbGameId, skipping stats update');
    return;
  }

  // Check if stats have already been applied (idempotency guard)
  const alreadyApplied = game.gameState?.statsApplied;
  if (false) { // DISABLED: Always allow coin updates
    console.log('[STATS SKIP] Stats/coins already applied for game', game.dbGameId);
    return; // Skip this update
  }

  try {
    // Calculate prizes and update coins
    const totalBuyIn = game.buyIn * 4; // 4 players
    const houseFee = Math.floor(totalBuyIn * 0.1); // 10% house fee
    const prizePool = totalBuyIn - houseFee;
    
    // Determine winners and losers
    const winners: GamePlayer[] = [];
    const losers: GamePlayer[] = [];
    
    for (const player of game.players) {
      if (player && player.type === 'human') {
        if (player.score >= game.maxPoints) {
          winners.push(player);
        } else {
          losers.push(player);
        }
      }
    }
    
    // Calculate prize per winner
    const prizePerWinner = winners.length > 0 ? Math.floor(prizePool / winners.length) : 0;
    
    console.log('[PRIZE DEBUG] Prize calculation:', {
      totalBuyIn,
      houseFee,
      prizePool,
      winners: winners.length,
      losers: losers.length,
      prizePerWinner
    });
    
    // Update coins for winners
    for (const winner of winners) {
      if (winner.type === 'bot') continue; // Skip bot players
      const userId = winner.id as string;
      if (!userId) continue;
      
      try {
        const result = await prisma.user.update({
          where: { id: userId },
          data: { coins: { increment: prizePerWinner } }
        });
        
        console.log('[COIN UPDATE DEBUG] Winner coins updated:', {
          userId,
          prizeAmount: prizePerWinner,
          newBalance: result.coins
        });
      } catch (err) {
        console.error('Failed to update winner coins:', err);
      }
    }
    
    // Update UserStats for all human players
    for (let i = 0; i < 4; i++) {
      const player = game.players[i];
      if (!player) continue;
      if (player.type === 'bot') continue; // Skip bot players
      const userId = player.id as string;
      if (!userId) continue;
      
      try {
        const isWinner = player.score >= game.maxPoints;
        const isLoser = !isWinner;
        
        await prisma.userStats.upsert({
          where: { userId },
          update: {
            gamesPlayed: { increment: 1 },
            gamesWon: isWinner ? { increment: 1 } : undefined,
            gamesLost: isLoser ? { increment: 1 } : undefined,
            totalCoinsWon: isWinner ? { increment: prizePerWinner } : undefined,
            totalCoinsLost: isLoser ? { increment: game.buyIn } : undefined
          },
          create: {
            userId,
            gamesPlayed: 1,
            gamesWon: isWinner ? 1 : 0,
            gamesLost: isLoser ? 1 : 0,
            totalCoinsWon: isWinner ? prizePerWinner : 0,
            totalCoinsLost: isLoser ? game.buyIn : 0
          }
        });
        
        console.log('[STATS UPDATE] Updated stats for player:', userId, 'isWinner:', isWinner);
      } catch (err) {
        console.error('Failed to update user stats:', err);
      }
    }
    
    // Mark stats as applied
    if (!game.gameState) {
      game.gameState = {};
    }
    game.gameState.statsApplied = true;
    
    console.log('[STATS UPDATE] Stats and coins update completed for game:', game.id);
    
  } catch (error) {
    console.error('[STATS UPDATE] Error updating stats and coins:', error);
  }
}

export function enrichGameForClient(game: Game) {
  // Return game data enriched for client consumption
  return {
    ...game,
    // Add any client-specific transformations here
  };
}

export async function logGameStart(game: Game) {
  if (!game.dbGameId) return;
  
  try {
    await trickLogger.startRound(game.dbGameId, 1);
    console.log('[GAME LOG] Game start logged for:', game.dbGameId);
  } catch (err) {
    console.error('Failed to log game start:', err);
  }
}

export async function updateGamePlayerRecord(game: Game, playerIndex: number) {
  if (!game.dbGameId || !game.players[playerIndex]) return;
  
  const player = game.players[playerIndex];
  if (!player || player.type !== 'human') return;
  
  try {
    await prisma.gamePlayer.upsert({
      where: {
        gameId_playerId: {
          gameId: game.dbGameId,
          playerId: player.id
        }
      },
      update: {
        username: player.username,
        avatar: player.avatar,
        score: player.score,
        bid: player.bid,
        tricks: player.tricks,
        nil: player.nil,
        blindNil: player.blindNil
      },
      create: {
        gameId: game.dbGameId,
        playerId: player.id,
        username: player.username,
        avatar: player.avatar,
        score: player.score,
        bid: player.bid,
        tricks: player.tricks,
        nil: player.nil,
        blindNil: player.blindNil
      }
    });
  } catch (err) {
    console.error('Failed to update game player record:', err);
  }
}
