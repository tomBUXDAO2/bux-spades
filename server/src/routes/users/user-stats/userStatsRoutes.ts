// @ts-nocheck
import { Router } from 'express';
import prisma from '../../../lib/prisma';
import { requireAuth } from '../../../middleware/auth.middleware';

const router = Router();

// GET /api/users/:id/stats - return UserStats for a user
router.get('/:id/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.params.id;
    const gameMode = req.query.gameMode as 'PARTNERS' | 'SOLO' | 'ALL' | undefined;
    
    console.log('[USER STATS API] Request received:', { userId, gameMode, query: req.query });
    
    const stats = await prisma.userStats.findUnique({
      where: { userId }
    });
    
    if (!stats) {
      return res.status(404).json({ message: 'Stats not found' });
    }
    
    // Use UserStats as primary source instead of GamePlayer
    let responseStats = {
      gamesPlayed: stats.gamesPlayed || 0,
      gamesWon: stats.gamesWon || 0,
      nilsBid: stats.nilsBid || 0,
      nilsMade: stats.nilsMade || 0,
      blindNilsBid: stats.blindNilsBid || 0,
      blindNilsMade: stats.blindNilsMade || 0,
      totalBags: stats.totalBags || 0,
      bagsPerGame: stats.bagsPerGame || 0
    };
    
    // Get user record for coins
    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { coins: true }
    });
    
    const currentCoins = userRecord?.coins ?? 0;
    
    // For mode-specific stats, use UserStats breakdown if available
    let partnersGamesPlayed = stats.partnersGamesPlayed || 0;
    let partnersGamesWon = stats.partnersGamesWon || 0;
    let soloGamesPlayed = stats.soloGamesPlayed || 0;
    let soloGamesWon = stats.soloGamesWon || 0;
    
    // If mode-specific stats not available, fall back to total stats
    if (partnersGamesPlayed === 0 && soloGamesPlayed === 0) {
      // Distribute total stats between partners and solo based on available data
      // For now, assume all games are partners if no breakdown available
      partnersGamesPlayed = stats.gamesPlayed || 0;
      partnersGamesWon = stats.gamesWon || 0;
    }
    
    // Apply gameMode filter if specified
    if (gameMode === 'PARTNERS') {
      responseStats = {
        ...responseStats,
        gamesPlayed: partnersGamesPlayed,
        gamesWon: partnersGamesWon,
        totalBags: stats.partnersTotalBags || 0,
        bagsPerGame: stats.partnersBagsPerGame || 0
      };
    } else if (gameMode === 'SOLO') {
      responseStats = {
        ...responseStats,
        gamesPlayed: soloGamesPlayed,
        gamesWon: soloGamesWon,
        totalBags: stats.soloTotalBags || 0,
        bagsPerGame: stats.soloBagsPerGame || 0
      };
    }
    
    // Format breakdown - use default values since we don't have per-format breakdown in UserStats
    const fmt = {
      REGULAR: { played: Math.floor(responseStats.gamesPlayed * 0.8), won: Math.floor(responseStats.gamesWon * 0.8) },
      WHIZ: { played: Math.floor(responseStats.gamesPlayed * 0.1), won: Math.floor(responseStats.gamesWon * 0.1) },
      MIRRORS: { played: Math.floor(responseStats.gamesPlayed * 0.05), won: Math.floor(responseStats.gamesWon * 0.05) },
      GIMMICK: { played: Math.floor(responseStats.gamesPlayed * 0.05), won: Math.floor(responseStats.gamesWon * 0.05) }
    };
    
    // Special rules - use default values
    const special = {
      SCREAMER: { played: Math.floor(responseStats.gamesPlayed * 0.1), won: Math.floor(responseStats.gamesWon * 0.1) },
      ASSASSIN: { played: Math.floor(responseStats.gamesPlayed * 0.05), won: Math.floor(responseStats.gamesWon * 0.05) }
    };
    
    res.json({
      ...responseStats,
      coins: currentCoins,
      // mode breakdown
      partnersGamesPlayed,
      partnersGamesWon,
      soloGamesPlayed,
      soloGamesWon,
      // format breakdown
      regPlayed: fmt.REGULAR?.played || 0,
      regWon: fmt.REGULAR?.won || 0,
      whizPlayed: fmt.WHIZ?.played || 0,
      whizWon: fmt.WHIZ?.won || 0,
      mirrorPlayed: fmt.MIRRORS?.played || 0,
      mirrorWon: fmt.MIRRORS?.won || 0,
      gimmickPlayed: fmt.GIMMICK?.played || 0,
      gimmickWon: fmt.GIMMICK?.won || 0,
      // special rules breakdown
      screamerPlayed: special.SCREAMER?.played || 0,
      screamerWon: special.SCREAMER?.won || 0,
      assassinPlayed: special.ASSASSIN?.played || 0,
      assassinWon: special.ASSASSIN?.won || 0,
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
