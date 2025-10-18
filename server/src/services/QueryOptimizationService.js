import { prisma } from '../config/database.js';

/**
 * QUERY OPTIMIZATION SERVICE
 * Provides optimized database queries to avoid N+1 problems and improve performance
 */
export class QueryOptimizationService {
  
  /**
   * Get game with all related data in a single optimized query
   */
  static async getGameWithAllData(gameId) {
    return await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        players: {
          include: {
            user: {
              select: { id: true, username: true, avatarUrl: true }
            }
          },
          orderBy: { seatIndex: 'asc' }
        },
        rounds: {
          include: {
            tricks: {
              include: {
                cards: {
                  orderBy: { playOrder: 'asc' }
                }
              },
              orderBy: { trickNumber: 'asc' }
            },
            playerStats: {
              orderBy: { seatIndex: 'asc' }
            },
            RoundScore: true
          },
          orderBy: { roundNumber: 'asc' }
        },
        result: true
      }
    });
  }
  
  /**
   * Get current round data with optimized queries
   */
  static async getCurrentRoundData(gameId, roundNumber) {
    return await prisma.round.findFirst({
      where: { 
        gameId,
        roundNumber 
      },
      include: {
        tricks: {
          include: {
            cards: {
              orderBy: { playOrder: 'asc' }
            }
          },
          orderBy: { trickNumber: 'asc' }
        },
        playerStats: {
          orderBy: { seatIndex: 'asc' }
        },
        RoundScore: true
      }
    });
  }
  
  /**
   * Get player stats for current round with optimized query
   */
  static async getCurrentRoundPlayerStats(roundId) {
    return await prisma.playerRoundStats.findMany({
      where: { roundId },
      orderBy: { seatIndex: 'asc' }
    });
  }
  
  /**
   * Get trick data with optimized query
   */
  static async getTrickData(trickId) {
    return await prisma.trick.findUnique({
      where: { id: trickId },
      include: {
        cards: {
          orderBy: { playOrder: 'asc' }
        }
      }
    });
  }
  
  /**
   * Get game players with user data in single query
   */
  static async getGamePlayersWithUsers(gameId) {
    return await prisma.gamePlayer.findMany({
      where: { gameId },
      include: {
        user: {
          select: { id: true, username: true, avatarUrl: true }
        }
      },
      orderBy: { seatIndex: 'asc' }
    });
  }
  
  /**
   * Get active games with optimized query
   */
  static async getActiveGamesOptimized() {
    return await prisma.game.findMany({
      where: {
        status: {
          in: ['WAITING', 'BIDDING', 'PLAYING']
        }
      },
      include: {
        players: {
          include: {
            user: {
              select: { id: true, username: true, avatarUrl: true }
            }
          },
          orderBy: { seatIndex: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }
  
  /**
   * Get round scores with running totals
   */
  static async getRoundScoresWithTotals(gameId) {
    return await prisma.roundScore.findMany({
      where: { 
        Round: { gameId }
      },
      include: { Round: true },
      orderBy: { Round: { roundNumber: 'asc' } }
    });
  }
  
  /**
   * Get latest round score for running totals
   */
  static async getLatestRoundScore(gameId) {
    return await prisma.roundScore.findFirst({
      where: { 
        Round: { gameId }
      },
      orderBy: { Round: { roundNumber: 'desc' } }
    });
  }
  
  /**
   * Get completed tricks count for a round (optimized)
   */
  static async getCompletedTricksCount(roundId) {
    const result = await prisma.playerRoundStats.aggregate({
      where: { roundId },
      _sum: { tricksWon: true }
    });
    
    return result._sum.tricksWon || 0;
  }
  
  /**
   * Get player hand from database (optimized)
   */
  static async getPlayerHandOptimized(gameId, seatIndex) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { 
        currentRound: true,
        gameState: true 
      }
    });
    
    if (!game) return [];
    
    // Get dealt cards from game state
    const gameState = game.gameState || {};
    const dealtHand = gameState.hands?.[seatIndex] || [];
    
    // Get played cards from current round
    const currentRound = await prisma.round.findFirst({
      where: { 
        gameId,
        roundNumber: game.currentRound 
      },
      include: {
        tricks: {
          include: {
            cards: {
              where: { seatIndex },
              orderBy: { playOrder: 'asc' }
            }
          }
        }
      }
    });
    
    if (!currentRound) return dealtHand;
    
    const playedCards = currentRound.tricks.flatMap(trick => 
      trick.cards.map(card => ({
        suit: card.suit,
        rank: card.rank
      }))
    );
    
    // Subtract played cards from dealt hand
    return dealtHand.filter(dealtCard => 
      !playedCards.some(playedCard => 
        playedCard.suit === dealtCard.suit && playedCard.rank === dealtCard.rank
      )
    );
  }
}
