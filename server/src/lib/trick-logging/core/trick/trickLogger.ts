import prisma from '../../../prisma';
import { TrickLogData } from '../../types/trickLogTypes';
import { getCardValue, getFullSuitName } from '../../utils/cardUtils';

export class TrickLogger {
  /**
   * Log a completed trick to the database
   */
  async logTrick(trickData: TrickLogData): Promise<string> {
    const isProduction = process.env.NODE_ENV === 'production';
    
    try {
      // Create the trick record
      const trickId = `trick_${trickData.roundId}_${trickData.trickNumber}_${Date.now()}`;
      const trick = await prisma.trick.create({
        data: {
          id: trickId,
          roundId: trickData.roundId,
          trickNumber: trickData.trickNumber,
          leadPlayerId: trickData.leadPlayerId,
          winningPlayerId: trickData.winningPlayerId,
          updatedAt: new Date(),
        } as any,
      });

      // Optimized: Batch create all card records for this trick
      const cardData = trickData.cards.map((card, index) => ({
        id: `card_${trick.id}_${index}_${Date.now()}`,
        trickId: trick.id,
        playerId: card.playerId,
        suit: getFullSuitName(card.suit) as any,
        value: card.value,
        position: card.position,
        updatedAt: new Date(),
      }));

      await prisma.card.createMany({
        data: cardData as any,
      });
      if (!isProduction) {
        console.log(`[TRICK LOGGER] Logged trick ${trickData.trickNumber} with ${trickData.cards.length} cards for round ${trickData.roundId}`);
      }
      return trick.id;
    } catch (error) {
      console.error(`[TRICK LOGGER] Failed to log trick for round ${trickData.roundId}:`, error);
      throw error;
    }
  }
}
