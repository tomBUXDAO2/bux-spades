import { v4 as uuidv4 } from 'uuid';
import prisma from '../../prisma';

// Update PlayerTrickCount after every trick
export async function updatePlayerTrickCount(gameId: string, roundNumber: number, playerId: string, tricksWon: number) {
  console.log('[TRICK COUNT MANAGER] updatePlayerTrickCount called with:', {
    gameId,
    roundNumber,
    playerId,
    tricksWon
  });
  
  try {
    // Find the actual roundId from database
    console.log('[TRICK COUNT MANAGER] Looking for round with gameId:', gameId, 'roundNumber:', roundNumber);
    const round = await prisma.round.findFirst({
      where: { gameId, roundNumber }
    });
    
    if (!round) {
      console.error(`[TRICK COUNT MANAGER ERROR] Round ${roundNumber} not found for game ${gameId}`);
      return;
    }
    
    console.log('[TRICK COUNT MANAGER] Found round:', round.id);
    
    const result = await prisma.playerTrickCount.upsert({
      where: {
        gameId_roundId_playerId: {
          gameId,
          roundId: round.id,
          playerId
        }
      },
      update: {
        tricksWon,
        lastUpdated: new Date()
      },
      create: {
        id: uuidv4(),
        gameId,
        roundId: round.id,
        playerId,
        tricksWon
      }
    });
    
    console.log(`[TRICK COUNT MANAGER] SUCCESS: Updated PlayerTrickCount: ${playerId} has ${tricksWon} tricks in round ${round.id}, result ID: ${result.id}`);
  } catch (error) {
    console.error(`[TRICK COUNT MANAGER ERROR] Failed to update PlayerTrickCount:`, error);
    throw error; // Re-throw to ensure the error is not silently ignored
  }
}
