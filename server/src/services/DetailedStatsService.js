import { prisma } from '../config/databaseFirst.js';

export class DetailedStatsService {
  // Get comprehensive user stats with all breakdowns
  static async getUserStats(userId, filters = {}) {
    try {
      const {
        mode = 'ALL',        // ALL, PARTNERS, SOLO
        format = 'ALL',      // ALL, REGULAR, WHIZ, MIRROR, GIMMICK
        isLeague = null,     // null = all, true = league only, false = non-league only
        gimmickVariant = null // null = all, specific variant
      } = filters;

      // Build where clause for game filtering
      const gameWhere = {
        status: 'FINISHED'
      };

      if (mode !== 'ALL') {
        gameWhere.mode = mode;
      }

      if (format !== 'ALL') {
        gameWhere.format = format;
      }

      if (isLeague !== null) {
        gameWhere.isLeague = isLeague;
      }

      if (gimmickVariant) {
        gameWhere.gimmickVariant = gimmickVariant;
      }

      // Get basic game stats
      const gameStats = await this.getGameStats(userId, gameWhere);
      
      // Get nil stats
      const nilStats = await this.getNilStats(userId, gameWhere);
      
      // Get bags stats
      const bagsStats = await this.getBagsStats(userId, gameWhere);
      
      // Get format breakdown
      const formatBreakdown = await this.getFormatBreakdown(userId, mode, isLeague);
      
      // Get special rules breakdown
      const specialRulesBreakdown = await this.getSpecialRulesBreakdown(userId, mode, isLeague);
      
      // Get mode breakdown (if showing all modes)
      const modeBreakdown = mode === 'ALL' ? await this.getModeBreakdown(userId, format, isLeague) : null;

      return {
        // Basic stats
        totalGames: gameStats.totalGames,
        gamesWon: gameStats.gamesWon,
        winRate: gameStats.winRate,
        totalCoins: gameStats.totalCoins,
        
        // Nil stats
        nils: {
          bid: nilStats.nilsBid,
          made: nilStats.nilsMade,
          rate: nilStats.nilRate
        },
        blindNils: {
          bid: nilStats.blindNilsBid,
          made: nilStats.blindNilsMade,
          rate: nilStats.blindNilRate
        },
        
        // Bags stats
        bags: {
          total: bagsStats.totalBags,
          perGame: bagsStats.bagsPerGame
        },
        
        // Format breakdown
        formatBreakdown,
        
        // Special rules breakdown
        specialRulesBreakdown,
        
        // Mode breakdown (only if showing all modes)
        modeBreakdown
      };

    } catch (error) {
      console.error('[DETAILED STATS SERVICE] Error getting user stats:', error);
      throw error;
    }
  }

  // Get basic game statistics
  static async getGameStats(userId, gameWhere) {
    // Total games played
    const totalGames = await prisma.gamePlayer.count({
      where: {
        userId,
        game: gameWhere
      }
    });

    // Games won
    const gamesWon = await prisma.gameResult.count({
      where: {
        game: {
          ...gameWhere,
          players: {
            some: { userId }
          }
        },
        winner: userId
      }
    });

    // Win rate
    const winRate = totalGames > 0 ? (gamesWon / totalGames) * 100 : 0;

    // Total coins - not tracked in PlayerRoundStats, would need to calculate from GameResult
    const totalCoins = 0;

    return {
      totalGames,
      gamesWon,
      winRate,
      totalCoins
    };
  }

  // Get nil statistics
  static async getNilStats(userId, gameWhere) {
    // Nil bids - cannot track this without RoundBid table, using made nils as approximation
    const nilsBid = await prisma.playerRoundStats.count({
      where: {
        userId,
        madeNil: true,
        round: {
          game: gameWhere
        }
      }
    });

    // Nil made
    const nilsMade = await prisma.playerRoundStats.count({
      where: {
        userId,
        madeNil: true,
        round: {
          game: gameWhere
        }
      }
    });

    // Blind nil bids - cannot track this without RoundBid table, using made blind nils as approximation
    const blindNilsBid = await prisma.playerRoundStats.count({
      where: {
        userId,
        madeBlindNil: true,
        round: {
          game: gameWhere
        }
      }
    });

    // Blind nil made
    const blindNilsMade = await prisma.playerRoundStats.count({
      where: {
        userId,
        madeBlindNil: true,
        round: {
          game: gameWhere
        }
      }
    });

    const nilRate = nilsBid > 0 ? (nilsMade / nilsBid) * 100 : 0;
    const blindNilRate = blindNilsBid > 0 ? (blindNilsMade / blindNilsBid) * 100 : 0;

    return {
      nilsBid,
      nilsMade,
      nilRate,
      blindNilsBid,
      blindNilsMade,
      blindNilRate
    };
  }

  // Get bags statistics
  static async getBagsStats(userId, gameWhere) {
    const bagsStats = await prisma.playerRoundStats.aggregate({
      where: {
        userId,
        round: {
          game: gameWhere
        }
      },
      _sum: {
        bagsThisRound: true
      },
      _count: {
        id: true
      }
    });

    const totalBags = bagsStats._sum.bagsThisRound || 0;
    const roundsPlayed = bagsStats._count.id;
    const bagsPerGame = roundsPlayed > 0 ? totalBags / roundsPlayed : 0;

    return {
      totalBags,
      bagsPerGame
    };
  }

  // Get format breakdown (Regular, Whiz, Mirror, Gimmick)
  static async getFormatBreakdown(userId, mode = 'ALL', isLeague = null) {
    const formats = ['REGULAR', 'WHIZ', 'MIRROR', 'GIMMICK'];
    const breakdown = {};

    for (const format of formats) {
      const gameWhere = {
        status: 'FINISHED',
        format,
        ...(mode !== 'ALL' && { mode }),
        ...(isLeague !== null && { isLeague })
      };

      const stats = await this.getGameStats(userId, gameWhere);
      
      breakdown[format.toLowerCase()] = {
        played: stats.totalGames,
        won: stats.gamesWon,
        winRate: stats.winRate
      };
    }

    return breakdown;
  }

  // Get special rules breakdown (Screamer, Assassin, etc.)
  static async getSpecialRulesBreakdown(userId, mode = 'ALL', isLeague = null) {
    // This would require checking the specialRules JSON field
    // For now, returning placeholder structure
    return {
      screamer: { played: 0, won: 0, winRate: 0 },
      assassin: { played: 0, won: 0, winRate: 0 }
    };
  }

  // Get mode breakdown (Partners, Solo)
  static async getModeBreakdown(userId, format = 'ALL', isLeague = null) {
    const modes = ['PARTNERS', 'SOLO'];
    const breakdown = {};

    for (const mode of modes) {
      const gameWhere = {
        status: 'FINISHED',
        mode,
        ...(format !== 'ALL' && { format }),
        ...(isLeague !== null && { isLeague })
      };

      const stats = await this.getGameStats(userId, gameWhere);
      
      breakdown[mode.toLowerCase()] = {
        played: stats.totalGames,
        won: stats.gamesWon,
        winRate: stats.winRate
      };
    }

    return breakdown;
  }

  // Get leaderboard with filters
  static async getLeaderboard(filters = {}) {
    try {
      const {
        mode = 'ALL',
        format = 'ALL',
        isLeague = null,
        limit = 10,
        sortBy = 'winRate' // winRate, gamesPlayed, totalCoins
      } = filters;

      // This would require a complex SQL query to get leaderboard stats
      // For now, returning a simplified version
      
      const users = await prisma.user.findMany({
        take: limit * 2, // Get more to filter
        include: {
          games: {
            where: {
              game: {
                status: 'FINISHED',
                ...(mode !== 'ALL' && { mode }),
                ...(format !== 'ALL' && { format }),
                ...(isLeague !== null && { isLeague })
              }
            }
          }
        }
      });

      // Calculate stats for each user
      const leaderboard = await Promise.all(
        users.map(async (user) => {
          const gameWhere = {
            status: 'FINISHED',
            ...(mode !== 'ALL' && { mode }),
            ...(format !== 'ALL' && { format }),
            ...(isLeague !== null && { isLeague })
          };

          const stats = await this.getGameStats(user.id, gameWhere);
          
          if (stats.totalGames === 0) return null;

          return {
            discordId: user.discordId,
            username: user.username,
            ...stats
          };
        })
      );

      // Filter out users with no games and sort
      return leaderboard
        .filter(user => user !== null)
        .sort((a, b) => {
          switch (sortBy) {
            case 'gamesPlayed':
              return b.totalGames - a.totalGames;
            case 'totalCoins':
              return b.totalCoins - a.totalCoins;
            case 'winRate':
            default:
              return b.winRate - a.winRate;
          }
        })
        .slice(0, limit);

    } catch (error) {
      console.error('[DETAILED STATS SERVICE] Error getting leaderboard:', error);
      throw error;
    }
  }

  // Get stats for multiple users (for leaderboard)
  static async getBulkUserStats(userIds, filters = {}) {
    try {
      const results = await Promise.all(
        userIds.map(async (userId) => {
          try {
            const stats = await this.getUserStats(userId, filters);
            return { userId, ...stats };
          } catch (error) {
            console.error(`[DETAILED STATS SERVICE] Error getting stats for user ${userId}:`, error);
            return null;
          }
        })
      );

      return results.filter(result => result !== null);
    } catch (error) {
      console.error('[DETAILED STATS SERVICE] Error getting bulk user stats:', error);
      throw error;
    }
  }
}
