import { v4 as uuidv4 } from 'uuid';
import prisma from '../../prisma';

// Update PlayerTrickCount after every trick
export async function updatePlayerTrickCount(gameId: string, roundNumber: number, playerId: string, tricksWon: number) {
  console.log('[TRICK COUNT MANAGER DEBUG] updatePlayerTrickCount called with:', {
    gameId,
    roundNumber,
    playerId,
    tricksWon
  });
  try {
    // Find the actual roundId from database
    console.log('[TRICK COUNT MANAGER DEBUG] Looking for round with gameId:', gameId, 'roundNumber:', roundNumber);
    const round = await prisma.round.findFirst({
      where: { gameId, roundNumber }
    });
    console.log('[TRICK COUNT MANAGER DEBUG] Found round:', round ? round.id : 'NOT FOUND');
    
    if (!round) {
      console.error(`[DB SCORING ERROR] Round ${roundNumber} not found for game ${gameId}`);
      return;
    }
    
    await prisma.playerTrickCount.upsert({
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
    console.log(`[DB SCORING] Updated PlayerTrickCount: ${playerId} has ${tricksWon} tricks in round ${round.id}`);
  } catch (error) {
    console.error(`[DB SCORING ERROR] Failed to update PlayerTrickCount:`, error);
  }
}
