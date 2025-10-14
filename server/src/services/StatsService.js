import { prisma } from '../config/database.js';

export class StatsService {
  // Get user stats calculated from actual game data
  static async getUserStats(userId, format = 'ALL', mode = 'ALL', isLeague = false) {
    try {
      // Build where clause for filtering
      const gameFilter = {
        status: 'FINISHED'
      };

      if (format !== 'ALL') {
        gameFilter.format = format;
      }

      if (mode !== 'ALL') {
        gameFilter.mode = mode;
      }

      if (isLeague) {
        gameFilter.isLeague = true;
      }

      const whereClause = {
        userId,
        round: {
          game: gameFilter
        }
      };

      // Get aggregated stats from PlayerRoundStats (only fields that exist)
      const stats = await prisma.playerRoundStats.aggregate({
        where: whereClause,
        _sum: {
          tricksWon: true,
          bagsThisRound: true
        },
        _count: {
          id: true
        }
      });

      // Get bid stats
      const bidStats = await prisma.roundBid.aggregate({
        where: {
          userId,
          round: {
            game: {
              status: 'FINISHED',
              ...(format !== 'ALL' && { format }),
              ...(mode !== 'ALL' && { mode }),
              ...(isLeague && { isLeague: true })
            }
          }
        },
        _count: {
          id: true
        }
      });

      // Get nil bid stats
      const nilStats = await prisma.roundBid.aggregate({
        where: {
          userId,
          isNil: true,
          round: {
            game: {
              status: 'FINISHED',
              ...(format !== 'ALL' && { format }),
              ...(mode !== 'ALL' && { mode }),
              ...(isLeague && { isLeague: true })
            }
          }
        },
        _count: {
          id: true
        }
      });

      // Get nil made stats
      const nilMadeStats = await prisma.playerRoundStats.aggregate({
        where: {
          userId,
          madeNil: true,
          round: {
            game: gameFilter
          }
        },
        _count: {
          id: true
        }
      });

      // Get games won count
      const gamesWon = await prisma.gameResult.count({
        where: {
          game: {
            GamePlayer: {
              some: { userId }
            },
            status: 'FINISHED',
            ...(format !== 'ALL' && { format }),
            ...(mode !== 'ALL' && { mode }),
            ...(isLeague && { isLeague: true })
          },
          winner: userId
        }
      });

      // Get total games played
      const totalGames = await prisma.gamePlayer.count({
        where: {
          userId,
          game: {
            status: 'FINISHED',
            ...(format !== 'ALL' && { format }),
            ...(mode !== 'ALL' && { mode }),
            ...(isLeague && { isLeague: true })
          }
        }
      });

      // Calculate percentages
      const winRate = totalGames > 0 ? (gamesWon / totalGames) * 100 : 0;
      const nilRate = nilStats._count.id > 0 ? (nilMadeStats._count.id / nilStats._count.id) * 100 : 0;

      return {
        totalGames,
        gamesWon,
        winRate,
        totalPoints: 0, // Points not tracked in PlayerRoundStats
        totalCoins: 0, // Coins not tracked in PlayerRoundStats
        nilsBid: nilStats._count.id,
        nilsMade: nilMadeStats._count.id,
        nilRate,
        totalTricks: stats._sum.tricksWon || 0,
        totalBags: stats._sum.bagsThisRound || 0,
        roundsPlayed: stats._count.id
      };
    } catch (error) {
      console.error('[STATS SERVICE] Error getting user stats:', error);
      throw error;
    }
  }

  // Get leaderboard calculated from actual game data
  static async getLeaderboard(format = 'ALL', mode = 'ALL', isLeague = false, limit = 10) {
    try {
      // This would use a complex SQL query to get leaderboard stats
      // For now, returning a simplified version
      
      const users = await prisma.user.findMany({
        include: {
          games: {
            where: {
              game: {
                status: 'FINISHED',
                ...(format !== 'ALL' && { format }),
                ...(mode !== 'ALL' && { mode }),
                ...(isLeague && { isLeague: true })
              }
            }
          }
        }
      });

      // Calculate stats for each user
      const leaderboard = await Promise.all(
        users.map(async (user) => {
          const stats = await this.getUserStats(user.id, format, mode, isLeague);
          return {
            discordId: user.discordId,
            username: user.username,
            ...stats
          };
        })
      );

      // Sort by win rate and return top N
      return leaderboard
        .filter(user => user.totalGames > 0)
        .sort((a, b) => b.winRate - a.winRate)
        .slice(0, limit);

    } catch (error) {
      console.error('[STATS SERVICE] Error getting leaderboard:', error);
      throw error;
    }
  }

  // Update basic user stats (called after each game completion)
  static async updateUserStats(userId) {
    try {
      const stats = await this.getUserStats(userId);
      
      await prisma.userStats.upsert({
        where: { userId },
        update: {
          totalGamesPlayed: stats.totalGames,
          totalGamesWon: stats.gamesWon,
          totalCoinsWon: stats.totalCoins > 0 ? stats.totalCoins : 0,
          totalCoinsLost: stats.totalCoins < 0 ? Math.abs(stats.totalCoins) : 0,
          lastGameAt: new Date()
        },
        create: {
          userId,
          totalGamesPlayed: stats.totalGames,
          totalGamesWon: stats.gamesWon,
          totalCoinsWon: stats.totalCoins > 0 ? stats.totalCoins : 0,
          totalCoinsLost: stats.totalCoins < 0 ? Math.abs(stats.totalCoins) : 0,
          lastGameAt: new Date()
        }
      });

      console.log(`[STATS SERVICE] Updated stats for user ${userId}`);
    } catch (error) {
      console.error('[STATS SERVICE] Error updating user stats:', error);
      throw error;
    }
  }
}
