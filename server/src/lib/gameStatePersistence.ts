import prisma from './prisma';
import type { Game } from '../types/game';

/**
 * Save current game state to database
 */
export async function saveGameState(game: Game): Promise<void> {
  try {
    // Extract current game state
    const gameState = {
      players: game.players.map(p => p ? {
        id: p.id,
        username: p.username,
        type: p.type,
        position: p.position,
        team: p.team,
        hand: p.hand,
        bid: p.bid,
        tricks: p.tricks,
        points: p.points,
        nil: p.nil,
        blindNil: p.blindNil,
        connected: p.connected
      } : null),
      currentRound: game.currentRound || 1,
      currentTrick: game.currentTrick || 1,
      currentPlayer: game.currentPlayer?.id || null,
      dealer: game.dealer || 0,
      status: game.status,
      gameMode: game.gameMode,
      bidType: game.bidType,
      minPoints: game.minPoints,
      maxPoints: game.maxPoints,
      buyIn: game.buyIn,
      rules: game.rules,
      roundHistory: game.roundHistory || [],
      currentTrickCards: game.currentTrickCards || [],
      lastAction: game.lastAction,
      lastActionTime: game.lastActionTime,
      play: game.play,
      bidding: game.bidding,
      hands: game.hands,
      team1TotalScore: game.team1TotalScore,
      team2TotalScore: game.team2TotalScore,
      team1Bags: game.team1Bags,
      team2Bags: game.team2Bags,
      playerScores: game.playerScores,
      playerBags: game.playerBags
    };

    await prisma.game.update({
      where: { id: game.id },
      data: {
        currentRound: game.currentRound || 1,
        currentTrick: game.currentTrick || 1,
        currentPlayer: game.currentPlayer?.id || null,
        dealer: game.dealer || 0,
        gameState: gameState,
        lastActionAt: new Date(),
        updatedAt: new Date()
      }
    });

    console.log(`[GAME STATE] Saved state for game ${game.id} - Round ${game.currentRound || 1}, Trick ${game.currentTrick || 1}`);
  } catch (error) {
    console.error(`[GAME STATE] Failed to save state for game ${game.id}:`, error);
  }
}

/**
 * Restore game state from database
 */
export async function restoreGameState(gameId: string): Promise<Game | null> {
  try {
    const dbGame = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        GamePlayer: true,
        Round: {
          include: {
            Trick: {
              orderBy: { trickNumber: 'asc' }
            }
          },
          orderBy: { roundNumber: 'asc' }
        }
      }
    });

    if (!dbGame || !dbGame.gameState) {
      console.log(`[GAME STATE] No saved state found for game ${gameId}`);
      return null;
    }

    const gameState = dbGame.gameState as any;
    
    // Reconstruct the game object
    const game: Game = {
      id: dbGame.id,
      players: gameState.players.map((p: any) => p ? {
        ...p,
        socket: null, // Will be reconnected when players join
        lastAction: null,
        lastActionTime: null
      } : null),
      currentRound: gameState.currentRound || 1,
      currentTrick: gameState.currentTrick || 1,
      currentPlayer: gameState.players.find((p: any) => p?.id === gameState.currentPlayer) || null,
      dealer: gameState.dealer || 0,
      status: gameState.status,
      gameMode: gameState.gameMode,
      bidType: gameState.bidType,
      minPoints: gameState.minPoints,
      maxPoints: gameState.maxPoints,
      buyIn: gameState.buyIn,
      rules: gameState.rules,
      roundHistory: gameState.roundHistory || [],
      currentTrickCards: gameState.currentTrickCards || [],
      lastAction: gameState.lastAction,
      lastActionTime: gameState.lastActionTime,
      play: gameState.play,
      bidding: gameState.bidding,
      hands: gameState.hands,
      team1TotalScore: gameState.team1TotalScore,
      team2TotalScore: gameState.team2TotalScore,
      team1Bags: gameState.team1Bags,
      team2Bags: gameState.team2Bags,
      playerScores: gameState.playerScores,
      playerBags: gameState.playerBags,
      createdAt: dbGame.createdAt.getTime(),
      updatedAt: dbGame.updatedAt.getTime()
    };

    console.log(`[GAME STATE] Restored game ${gameId} - Round ${game.currentRound}, Trick ${game.currentTrick}`);
    return game;
  } catch (error) {
    console.error(`[GAME STATE] Failed to restore game ${gameId}:`, error);
    return null;
  }
}

/**
 * Check for games that need to be restored after server restart
 */
export async function restoreAllActiveGames(): Promise<Game[]> {
  try {
    const activeGames = await prisma.game.findMany({
      where: {
        status: {
          in: ['PLAYING', 'BIDDING']
        }
      }
    });

    const restoredGames: Game[] = [];
    
    for (const dbGame of activeGames) {
      const restoredGame = await restoreGameState(dbGame.id);
      if (restoredGame) {
        restoredGames.push(restoredGame);
      }
    }

    console.log(`[GAME STATE] Restored ${restoredGames.length} active games after server restart`);
    return restoredGames;
  } catch (error) {
    console.error('[GAME STATE] Failed to restore active games:', error);
    return [];
  }
}

/**
 * Auto-save game state periodically
 */
export function startGameStateAutoSave(games: Game[]): void {
  setInterval(() => {
    games.forEach(game => {
      if (game.status === 'PLAYING' || game.status === 'BIDDING') {
        saveGameState(game);
      }
    });
  }, 30000); // Save every 30 seconds
}

/**
 * Check for stuck games and auto-complete them
 */
export async function checkForStuckGames(): Promise<void> {
  try {
    const stuckGames = await prisma.game.findMany({
      where: {
        status: {
          in: ['PLAYING', 'BIDDING']
        },
        lastActionAt: {
          lt: new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
        }
      }
    });

    for (const stuckGame of stuckGames) {
      console.log(`[STUCK GAME] Found stuck game ${stuckGame.id} - last action: ${stuckGame.lastActionAt}`);
      
      // Auto-complete the game or reset it
      await prisma.game.update({
        where: { id: stuckGame.id },
        data: {
          status: 'FINISHED',
          updatedAt: new Date()
        }
      });
      
      console.log(`[STUCK GAME] Auto-completed stuck game ${stuckGame.id}`);
    }
  } catch (error) {
    console.error('[STUCK GAME] Failed to check for stuck games:', error);
  }
} 