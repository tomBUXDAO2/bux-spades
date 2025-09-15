import { prisma } from '../../prisma';

/**
 * Retry mechanism for database operations
 */
export async function retryOperation<T>(operation: () => Promise<T>, maxRetries: number = 3, delay: number = 1000): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.log(`[RETRY] Database operation failed (attempt ${attempt}/${maxRetries}):`, error);
      if (attempt === maxRetries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * Update existing game record in database
 */
export async function updateGameRecord(gameId: string, gameData: any): Promise<any> {
  return await retryOperation(async () => {
    return await prisma.game.update({
      where: { id: gameId },
      data: {
        bidType: gameData.bidType,
        specialRules: gameData.specialRules,
        status: 'FINISHED'
      }
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
        creatorId: game.creatorId || game.players.find((p: any) => p && p.type === 'human' && p.id)?.id || 'unknown',
        gameMode: game.gameMode,
        bidType: gameData.bidType,
        specialRules: [],
        minPoints: game.minPoints,
        maxPoints: game.maxPoints,
        buyIn: game.buyIn,
        status: 'FINISHED',
        createdAt: now,
        updatedAt: now
      } as any
    });
  });
}

/**
 * Create or update game player record
 */
export async function upsertGamePlayer(dbGameId: string, player: any, position: number, gameMode: string, winner: number): Promise<void> {
  const userId = player.id;
  if (!userId) {
    console.log(`[GAME LOGGER] Player ${position} has no userId:`, player);
    return;
  }
  
  let team: number | null = null;
  if (gameMode === 'PARTNERS') team = position === 0 || position === 2 ? 1 : 2;
  const finalBid = player.bid || 0;
  const finalTricks = player.tricks || 0;
  const finalBags = Math.max(0, finalTricks - finalBid);
  const finalPoints = gameMode === 'SOLO' ? 0 : 0; // This would need to be calculated properly
  let won = false;
  if (gameMode === 'SOLO') won = position === winner;
  else won = team === winner;
  
  const playerId = `player_${dbGameId}_${position}_${Date.now()}`;
  const now = new Date();
  
  await prisma.gamePlayer.upsert({
    where: {
      gameId_position: {
        gameId: dbGameId,
        position: position
      }
    },
    update: {
      team,
      bid: finalBid,
      bags: finalBags,
      points: finalPoints,
      finalScore: finalPoints,
      finalBags,
      finalPoints,
      won,
      username: player.username,
      discordId: player.discordId || null
    },
    create: {
      id: playerId,
      gameId: dbGameId,
      userId,
      position: position,
      team,
      bid: finalBid,
      bags: finalBags,
      points: finalPoints,
      finalScore: finalPoints,
      finalBags,
      finalPoints,
      won,
      username: player.username,
      discordId: player.discordId || null,
      createdAt: now,
      updatedAt: now
    } as any
  });
}

/**
 * Create game result record
 */
export async function createGameResult(dbGameId: string, game: any, winner: number, finalScore: number, team1Score: number, team2Score: number, playerResults: any): Promise<void> {
  const existingGameResult = await prisma.gameResult.findUnique({
    where: { gameId: dbGameId }
  });

  if (!existingGameResult) {
    const resultId = `result_${dbGameId}_${Date.now()}`;
    const now = new Date();
    
    await retryOperation(async () => {
      return await prisma.gameResult.create({
        data: {
          id: resultId,
          gameId: dbGameId,
          winner,
          finalScore,
          gameDuration: Math.floor((Date.now() - (game.createdAt || Date.now())) / 1000),
          team1Score,
          team2Score,
          playerResults,
          totalRounds: game.rounds?.length || 0,
          totalTricks: game.play?.tricks?.length || 0,
          specialEvents: { nils: game.bidding?.nilBids || {}, totalHands: game.hands?.length || 0 },
          createdAt: now,
          updatedAt: now
        } as any
      });
    });
  }
}
