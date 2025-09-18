import { io } from '../../../index';
import type { Game } from '../../../types/game';
import prisma from '../../prisma';
import { CoinManager } from '../../coin-management/coinManager';

/**
 * Create GameResult entry for completed game
 */
async function createGameResult(game: Game, winningTeamOrPlayer: number) {
  try {
    // Get final scores and stats
    const team1Score = game.team1TotalScore || 0;
    const team2Score = game.team2TotalScore || 0;
    const finalScore = Math.max(team1Score, team2Score);
    
    // Get total rounds and tricks from database
    const rounds = await prisma.round.findMany({
      where: { gameId: game.dbGameId },
      include: { 
        PlayerTrickCount: true,
        _count: { select: { Trick: true } }
      }
    });
    
    const totalRounds = rounds.length;
    const totalTricks = rounds.reduce((sum, round) => sum + round._count.Trick, 0);

    // Preload per-player bids across rounds for accurate bags
    const roundIds = rounds.map(r => r.id);
    const roundBids = roundIds.length > 0 ? await prisma.roundBid.findMany({
      where: { roundId: { in: roundIds } }
    }) : [];
    
    // Create player results
    const playerResults = game.players.map((player, index) => {
      if (!player) return null;

      // Total tricks made across all rounds from PlayerTrickCount
      const totalTricksWon = rounds.reduce((sum, round) => {
        const ptc = round.PlayerTrickCount.find(p => p.playerId === player.id);
        return sum + (ptc?.tricksWon || 0);
      }, 0);

      // Total bid across all rounds from RoundBid
      const totalTricksBid = roundBids
        .filter(rb => rb.playerId === player.id)
        .reduce((sum, rb) => sum + (rb.bid || 0), 0);

      // Individual bags cannot be negative
      const individualBags = Math.max(0, totalTricksWon - totalTricksBid);
      
      return {
        playerId: player.id,
        username: player.username,
        position: index,
        team: player.team,
        tricksWon: totalTricksWon,
        tricksBid: totalTricksBid,
        points: player.points || 0,
        bags: individualBags
      };
    }).filter(Boolean);
    
    // Create GameResult
    const gameResult = await prisma.gameResult.create({
      data: {
        id: `gameresult_${game.dbGameId}_${Date.now()}`,
        gameId: game.dbGameId,
        winner: winningTeamOrPlayer,
        finalScore: finalScore,
        team1Score: team1Score,
        team2Score: team2Score,
        playerResults: playerResults as any,
        totalRounds: totalRounds,
        totalTricks: totalTricks,
        specialEvents: game.rules?.specialRules || {},
        updatedAt: new Date()
      }
    });
    
    console.log('[GAME COMPLETION] Created GameResult:', gameResult.id);
  } catch (error) {
    console.error('[GAME COMPLETION ERROR] Failed to create GameResult:', error);
    throw error;
  }
}

/**
 * Import and use the completeGame function from index.ts
 */
export async function completeGame(game: Game, winningTeamOrPlayer: number) {
  console.log('[GAME COMPLETION] Completing game:', game.id, 'Winner:', winningTeamOrPlayer);
  
  try {
    // Set game status to FINISHED
    game.status = 'FINISHED';
    
    // Update database status to FINISHED
    if (game.dbGameId) {
      const { prisma } = await import('../../prisma');
      await prisma.game.update({
        where: { id: game.dbGameId },
        data: { 
          status: 'FINISHED',
          completed: true,
          finalScore: Math.max(game.team1TotalScore || 0, game.team2TotalScore || 0),
          winner: winningTeamOrPlayer
        }
      });
      console.log('[GAME COMPLETION] Updated database status to FINISHED for game:', game.dbGameId);
      
      // Create GameResult entry
      await createGameResult(game, winningTeamOrPlayer);
    }
    
    // Emit game over event
    if (game.gameMode === 'SOLO') {
      io.to(game.id).emit('game_over', {
        playerScores: game.playerScores,
        winningPlayer: winningTeamOrPlayer,
      });
    } else {
      io.to(game.id).emit('game_over', {
        team1Score: game.team1TotalScore,
        team2Score: game.team2TotalScore,
        winningTeam: winningTeamOrPlayer,
      });
    }
    
    // Process coins (buy-in deductions and prize payouts)
    // This only happens when the game is FINISHED to avoid losing coins on crashes
    await CoinManager.processGameCoins(game, winningTeamOrPlayer);
    // const { updateStatsAndCoins } = await import('../routes/games.routes');
    
    
  } catch (error) {
    console.error('[GAME COMPLETION ERROR] Failed to complete game:', error);
    throw error;
  }
}
