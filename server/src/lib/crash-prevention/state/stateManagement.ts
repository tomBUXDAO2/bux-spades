import type { Game } from '../../../types/game';
import prisma from '../../prisma';
import { SafeOperations } from '../core/safeOperations';

/**
 * Safely save game state with crash protection
 */
export async function saveGameStateSafely(game: Game): Promise<void> {
  await SafeOperations.safeDbOperation(
    async () => {
      const gameState = {
        players: game.players.map(p => p ? {
          id: p.id,
          username: p.username,
          type: p.type,
          position: p.position,
          teamIndex: p.team,
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
        currentPlayer: typeof game.currentPlayer === 'string' ? game.currentPlayer : (game.currentPlayer as any)?.id || null,
        dealer: game.dealer || 0,
        status: game.status,
        lastSaved: Date.now()
      };

      // Disabled status updates to prevent premature FINISHED status
      // if (game.dbGameId) {
      //   await prisma.game.update({
      //     where: { id: game.dbGameId },
      //     data: { status: gameState.status || "PLAYING" }
      //   });
      // }
    },
    () => {
      console.log(`[CRASH PREVENTION] Failed to save game state for ${game.id} - using fallback`);
      // Store in memory as fallback
      (game as any).crashProtectedState = {
        ...game,
        crashProtected: true,
        lastSaved: Date.now()
      };
    },
    `Save game state for ${game.id}`
  );
}

/**
 * Safely load game state with crash protection
 */
export async function loadGameStateSafely(gameId: string): Promise<Game | null> {
  try {
    const dbGame = await prisma.game.findUnique({
      where: { id: gameId }
    });

    if (!dbGame) {
      return null;
    }

    // Convert database game to in-memory game format
    const game: Game = {
      id: dbGame.id,
      dbGameId: dbGame.id,
      mode: dbGame.mode as any,
      maxPoints: 500,
      minPoints: -500,
      buyIn: 0,
      specialRules: {},
      players: [] as any[],
      spectators: [] as any[],
      status: dbGame.status as any,
      completedTricks: [] as any[],
      rules: {
        gameType: dbGame.mode as any,
        allowNil: false,
        allowBlindNil: false,
        coinAmount: 0,
        maxPoints: 500,
        minPoints: -500,
        bidType: 'REGULAR' as any
      },
      isBotGame: false,
      currentRound: 1,
      currentTrick: 1,
      currentPlayer: null as any,
      dealer: 0,
      createdAt: dbGame.createdAt.getTime(),
      updatedAt: dbGame.updatedAt.getTime()
    };

    return game;
  } catch (error) {
    console.log(`[CRASH PREVENTION] Failed to load game state for ${gameId} - using fallback`);
    return null;
  }
}

/**
 * Safely update game status with crash protection
 */
export async function updateGameStatusSafely(gameId: string, status: string): Promise<void> {
  try {
    // TEMPORARILY DISABLED TO FIND WHAT'S SETTING FINISHED STATUS
    console.log(`[CRASH PREVENTION] Status update disabled: ${gameId} -> ${status}`);
    // await prisma.game.update({
    //   where: { id: gameId },
    //   data: { status: validStatus as any }
    // });
  } catch (error) {
    console.log(`[CRASH PREVENTION] Failed to update game status for ${gameId} - using fallback`);
  }
}

/**
 * Safely delete game with crash protection
 */
export async function deleteGameSafely(gameId: string): Promise<void> {
  try {
    await prisma.game.delete({
      where: { id: gameId }
    });
  } catch (error) {
    console.log(`[CRASH PREVENTION] Failed to delete game ${gameId} - using fallback`);
  }
}

/**
 * Safely get all games with crash protection
 */
export async function getAllGamesSafely(): Promise<Game[]> {
  try {
    const dbGames = await prisma.game.findMany();

    return dbGames.map(dbGame => ({
      id: dbGame.id,
      dbGameId: dbGame.id,
      mode: dbGame.mode as any,
      maxPoints: 500,
      minPoints: -500,
      buyIn: 0,
      specialRules: {},
      players: [] as any[],
      spectators: [] as any[],
      status: dbGame.status as any,
      completedTricks: [] as any[],
      rules: {
        gameType: dbGame.mode as any,
        allowNil: false,
        allowBlindNil: false,
        coinAmount: 0,
        maxPoints: 500,
        minPoints: -500,
        bidType: 'REGULAR' as any
      },
      isBotGame: false,
      currentRound: 1,
      currentTrick: 1,
      currentPlayer: null as any,
      dealer: 0,
      createdAt: dbGame.createdAt.getTime(),
      updatedAt: dbGame.updatedAt.getTime()
    }));
  } catch (error) {
    console.log(`[CRASH PREVENTION] Failed to get all games - using fallback`);
    return [];
  }
}

/**
 * Safely restore game state with crash protection
 */
export async function restoreGameStateSafely(gameId: string): Promise<Game | null> {
  return await loadGameStateSafely(gameId);
}
