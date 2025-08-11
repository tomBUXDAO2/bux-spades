import { PrismaClient } from '@prisma/client';
import { Game, Card } from '../types/game';
import { games } from '../gamesStore';

const prisma = new PrismaClient();

export interface TrickLogData {
  roundId: string;
  trickNumber: number;
  leadPlayerId: string;
  winningPlayerId: string;
  cards: {
    playerId: string;
    suit: string;
    value: number;
    position: number;
  }[];
}

export interface RoundLogData {
  gameId: string;
  roundNumber: number;
}

export class TrickLogger {
  private gameRounds: Map<string, string> = new Map(); // gameId -> currentRoundId
  private gameRoundNumbers: Map<string, number> = new Map(); // gameId -> currentRoundNumber

  /**
   * Start a new round/hand for a game
   */
  async startRound(gameId: string, roundNumber: number): Promise<string> {
    try {
      const round = await prisma.round.create({
        data: {
          gameId,
          roundNumber,
        },
      });

      this.gameRounds.set(gameId, round.id);
      this.gameRoundNumbers.set(gameId, roundNumber);
      
      console.log(`[TRICK LOGGER] Started round ${roundNumber} for game ${gameId} with ID ${round.id}`);
      return round.id;
    } catch (error) {
      console.error(`[TRICK LOGGER] Failed to start round for game ${gameId}:`, error);
      throw error;
    }
  }

  /**
   * Log a completed trick to the database
   */
  async logTrick(trickData: TrickLogData): Promise<string> {
    try {
      // Create the trick record
      const trick = await prisma.trick.create({
        data: {
          roundId: trickData.roundId,
          trickNumber: trickData.trickNumber,
          leadPlayerId: trickData.leadPlayerId,
          winningPlayerId: trickData.winningPlayerId,
        },
      });

      // Create all card records for this trick
      const cardPromises = trickData.cards.map(card => 
        prisma.card.create({
          data: {
            trickId: trick.id,
            playerId: card.playerId,
            suit: this.getFullSuitName(card.suit) as any, // Convert and cast to Suit enum
            value: card.value,
            position: card.position,
          },
        })
      );

      await Promise.all(cardPromises);

      console.log(`[TRICK LOGGER] Logged trick ${trickData.trickNumber} with ${trickData.cards.length} cards for round ${trickData.roundId}`);
      return trick.id;
    } catch (error) {
      console.error(`[TRICK LOGGER] Failed to log trick for round ${trickData.roundId}:`, error);
      throw error;
    }
  }

  /**
   * Log a trick from the game state
   */
  async logTrickFromGame(game: Game, trickNumber: number): Promise<void> {
    if (!game.play || !game.play.tricks || game.play.tricks.length === 0) {
      console.warn(`[TRICK LOGGER] No tricks to log for game ${game.id}`);
      return;
    }

    const trick = game.play.tricks[trickNumber - 1]; // Convert to 0-based index
    if (!trick) {
      console.warn(`[TRICK LOGGER] Trick ${trickNumber} not found for game ${game.id}`);
      return;
    }

    const gameIdForLookup = game.dbGameId || game.id;
    const roundId = this.gameRounds.get(gameIdForLookup);
    if (!roundId) {
      console.error(`[TRICK LOGGER] No active round found for game ${gameIdForLookup}`);
      return;
    }

    // Get the lead player (first player in the trick)
    const leadPlayerId = trick.cards[0]?.playedBy || game.players[0]?.id || '';
    
    // Get the winning player
    const winningPlayer = game.players[trick.winnerIndex];
    const winningPlayerId = winningPlayer?.id || '';

    const trickData: TrickLogData = {
      roundId,
      trickNumber,
      leadPlayerId,
      winningPlayerId,
      cards: trick.cards.map((card, index) => ({
        playerId: card.playedBy || game.players[card.playerIndex || 0]?.id || '',
        suit: this.getFullSuitName(card.suit),
        value: this.getCardValue(card.rank),
        position: index,
      })),
    };

    await this.logTrick(trickData);
  }

  /**
   * Log all tricks from a completed hand
   */
  async logCompletedHand(game: Game): Promise<void> {
    if (!game.play || !game.play.tricks) {
      console.warn(`[TRICK LOGGER] No tricks to log for completed hand in game ${game.id}`);
      return;
    }

    console.log(`[TRICK LOGGER] Logging ${game.play.tricks.length} tricks for completed hand in game ${game.id}`);

    // Since tricks are already logged individually during the game,
    // we don't need to log them again here to avoid duplicate key constraints
    console.log(`[TRICK LOGGER] Skipping duplicate trick logging - ${game.play.tricks.length} tricks already logged during game`);
  }

  /**
   * Get the current round ID for a game
   */
  getCurrentRoundId(gameId: string): string | undefined {
    return this.gameRounds.get(gameId);
  }

  /**
   * Get the current round number for a game
   */
  getCurrentRoundNumber(gameId: string): number | undefined {
    return this.gameRoundNumbers.get(gameId);
  }

  /**
   * Convert card rank to numeric value
   */
  private getCardValue(rank: string): number {
    const values: { [key: string]: number } = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
      'J': 11, 'Q': 12, 'K': 13, 'A': 14
    };
    return values[rank] || 0;
  }

  /**
   * Convert suit abbreviation to full suit name
   */
  private getFullSuitName(suit: string): string {
    const suitMap: { [key: string]: string } = {
      'S': 'SPADES',
      'H': 'HEARTS', 
      'D': 'DIAMONDS',
      'C': 'CLUBS'
    };
    return suitMap[suit] || suit;
  }

  /**
   * Clean up round tracking for a game
   */
  clearGameRounds(gameId: string): void {
    this.gameRounds.delete(gameId);
    this.gameRoundNumbers.delete(gameId);
  }

  /**
   * Get trick statistics for a game
   */
  async getGameTrickStats(gameId: string): Promise<{
    totalRounds: number;
    totalTricks: number;
    totalCards: number;
  }> {
    try {
      const rounds = await prisma.round.count({
        where: { gameId }
      });

      const tricks = await prisma.trick.count({
        where: {
          round: { gameId }
        }
      });

      const cards = await prisma.card.count({
        where: {
          trick: {
            round: { gameId }
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
          tricks: {
            include: {
              cards: true,
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

// Export a singleton instance
export const trickLogger = new TrickLogger(); 