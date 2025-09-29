import { prisma } from '../lib/prisma';

/**
 * Update user statistics
 */
export async function updateUserStats(
  userId: string,
  totalGamesPlayed: number,
  totalGamesWon: number,
  totalWinPct: number,
  totalBags: number,
  totalBagsPerGame: number,
  totalNilsBid: number,
  totalNilsMade: number,
  totalNilPct: number,
  totalBlindNilsBid: number,
  totalBlindNilsMade: number,
  totalBlindNilPct: number
): Promise<void> {
  try {
    console.log('[STATISTICS] Updating user stats for:', { userId });

    // Use upsert to update or create user stats
    await prisma.userStats.upsert({
      where: {
        userId: userId
      },
      update: {
        totalGamesPlayed: { increment: totalGamesPlayed },
        totalGamesWon: { increment: totalGamesWon },
        totalWinPct: totalWinPct,
        totalBags: { increment: totalBags },
        totalBagsPerGame: totalBagsPerGame,
        totalNilsBid: { increment: totalNilsBid },
        totalNilsMade: { increment: totalNilsMade },
        totalNilPct: totalNilPct,
        totalBlindNilsBid: { increment: totalBlindNilsBid },
        totalBlindNilsMade: { increment: totalBlindNilsMade },
        totalBlindNilPct: totalBlindNilPct
      },
      create: {
        userId,
        totalGamesPlayed,
        totalGamesWon,
        totalWinPct,
        totalBags,
        totalBagsPerGame,
        totalNilsBid,
        totalNilsMade,
        totalNilPct,
        totalBlindNilsBid,
        totalBlindNilsMade,
        totalBlindNilPct
      }
    });

    console.log('[STATISTICS] User stats updated successfully');

  } catch (error) {
    console.error('[STATISTICS] Error updating user stats:', error);
    throw error;
  }
}

/**
 * Get user statistics
 */
export async function getUserStats(userId: string): Promise<any> {
  try {
    const stats = await prisma.userStats.findUnique({
      where: { userId }
    });

    return stats;
  } catch (error) {
    console.error('[STATISTICS] Error getting user stats:', error);
    throw error;
  }
}

/**
 * Get leaderboard data
 */
export async function getLeaderboard(metric: string, limit: number = 10): Promise<any[]> {
  try {
    const leaderboard = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        coins: true
      },
      orderBy: {
        username: 'asc'
      },
      take: limit
    });

    return leaderboard;
  } catch (error) {
    console.error('[STATISTICS] Error getting leaderboard:', error);
    throw error;
  }
}
