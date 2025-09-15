import prisma from '../../prisma';
import { TrickStats } from '../types/trickLogTypes';

export class TrickStatsService {
  /**
   * Get trick statistics for a game
   */
  async getGameTrickStats(gameId: string): Promise<TrickStats> {
    try {
      const rounds = await prisma.round.count({
        where: { gameId }
      });

      const tricks = await prisma.trick.count({
        where: {
          Round: { gameId }
        }
      });

      const cards = await prisma.card.count({
        where: {
          Trick: {
            Round: { gameId }
          }
        }
      });

      return {
        totalRounds: rounds,
        totalTricks: tricks,
        totalCards: cards,
      };
    } catch (error) {
      console.error(`[TRICK LOGGER] Failed to get trick stats for game ${gameId}:`, error);
      return {
        totalRounds: 0,
        totalTricks: 0,
        totalCards: 0,
      };
    }
  }

  /**
   * Get detailed trick history for a game
   */
  async getGameTrickHistory(gameId: string): Promise<any[]> {
    try {
      const rounds = await prisma.round.findMany({
        where: { gameId },
        include: {
          Trick: {
            include: {
              Card: true,
            },
            orderBy: {
              trickNumber: 'asc',
            },
          },
        },
        orderBy: {
          roundNumber: 'asc',
        },
      });

      return rounds;
    } catch (error) {
      console.error(`[TRICK LOGGER] Failed to get trick history for game ${gameId}:`, error);
      return [];
    }
  }
}
