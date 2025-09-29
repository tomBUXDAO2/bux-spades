import prisma from '../../prisma';

// Retry operation with exponential backoff
async function retryOperation<T>(operation: () => Promise<T>, maxRetries: number = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      if (i === maxRetries - 1) throw error;
      if (error.code === 'P2002') throw error; // Unique constraint violation, don't retry
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * Update existing game record in database
 */
export async function updateGameRecord(gameId: string, updates: any): Promise<any> {
  console.log('[GAME RECORD] Updating game record:', { gameId, updates });
  
  return await retryOperation(async () => {
    return await prisma.game.update({
      where: { id: gameId },
      data: updates
    });
  });
}

/**
 * Create new game record in database
 */
export async function createGameRecord(game: any, gameData: any): Promise<any> {
  const gameId = game.id || `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date();
  
  return await retryOperation(async () => {
    return await prisma.game.create({
      data: {
        id: gameId,
        createdById: game.creatorId || game.players.find((p: any) => p && p.type === 'human' && p.id)?.id || 'unknown',
        mode: game.mode,
        format: game.format || 'REGULAR',
        gimmickVariant: game.gimmickVariant || null,
        isLeague: game.isLeague || false,
        isRated: game.isRated || false,
        specialRules: [],
        // never set FINISHED here; creation-only util
        status: 'WAITING',
        createdAt: now,
        updatedAt: now
      }
    });
  });
}

/**
 * Upsert game player record
 */
export async function upsertGamePlayer(data: any): Promise<any> {
  const { gameId, userId, seatIndex, teamIndex, isHuman, joinedAt, leftAt } = data;
  const now = new Date();
  const playerId = `player_${gameId}_${seatIndex}`;
  
  return await retryOperation(async () => {
    return await prisma.gamePlayer.upsert({
      where: {
        id: playerId
      },
      update: {
        teamIndex,
        leftAt: now
      },
      create: {
        id: playerId,
        gameId: gameId,
        userId: userId,
        seatIndex: seatIndex,
        teamIndex: teamIndex,
        isHuman: isHuman,
        joinedAt: joinedAt || now,
        leftAt: leftAt || now
      }
    });
  });
}

/**
 * Create game result record
 */
export async function createGameResult(data: any): Promise<any> {
  console.log('[GAME RESULT] Creating game result not yet fully implemented');
  return { success: true };
}
