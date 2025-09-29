import express from 'express';
import { DetailedStatsService } from '../services/DetailedStatsService.js';
import { prisma } from '../config/database.js';

const router = express.Router();

// Get user stats with detailed breakdowns
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      mode = 'ALL',        // ALL, PARTNERS, SOLO
      format = 'ALL',      // ALL, REGULAR, WHIZ, MIRROR, GIMMICK
      league = null,       // null = all, true = league only, false = non-league only
      gimmick = null       // null = all, specific variant
    } = req.query;

    const filters = {
      mode,
      format,
      isLeague: league === 'true' ? true : league === 'false' ? false : null,
      gimmickVariant: gimmick
    };

    const stats = await DetailedStatsService.getUserStats(userId, filters);
    
    res.json({
      success: true,
      data: stats,
      filters
    });

  } catch (error) {
    console.error('[STATS API] Error getting user stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get user stats' 
    });
  }
});

// Get user stats by Discord ID
router.get('/discord/:discordId', async (req, res) => {
  try {
    const { discordId } = req.params;
    
    // Get user by Discord ID
    const user = await prisma.user.findUnique({
      where: { discordId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const {
      mode = 'ALL',
      format = 'ALL',
      league = null,
      gimmick = null
    } = req.query;

    const filters = {
      mode,
      format,
      isLeague: league === 'true' ? true : league === 'false' ? false : null,
      gimmickVariant: gimmick
    };

    const stats = await DetailedStatsService.getUserStats(user.id, filters);
    
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          discordId: user.discordId,
          username: user.username,
          avatarUrl: user.avatarUrl
        },
        stats
      },
      filters
    });

  } catch (error) {
    console.error('[STATS API] Error getting user stats by Discord ID:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get user stats' 
    });
  }
});

// Get leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const {
      mode = 'ALL',
      format = 'ALL',
      league = null,
      limit = 10,
      sortBy = 'winRate'
    } = req.query;

    const filters = {
      mode,
      format,
      isLeague: league === 'true' ? true : league === 'false' ? false : null,
      limit: parseInt(limit),
      sortBy
    };

    const leaderboard = await DetailedStatsService.getLeaderboard(filters);
    
    res.json({
      success: true,
      data: leaderboard,
      filters
    });

  } catch (error) {
    console.error('[STATS API] Error getting leaderboard:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get leaderboard' 
    });
  }
});

// Get multiple users stats (for comparison)
router.post('/bulk', async (req, res) => {
  try {
    const { userIds, filters = {} } = req.body;

    if (!userIds || !Array.isArray(userIds)) {
      return res.status(400).json({
        success: false,
        error: 'userIds must be an array'
      });
    }

    const stats = await DetailedStatsService.getBulkUserStats(userIds, filters);
    
    res.json({
      success: true,
      data: stats,
      filters
    });

  } catch (error) {
    console.error('[STATS API] Error getting bulk user stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get bulk user stats' 
    });
  }
});

// Get available filter options
router.get('/filters', async (req, res) => {
  try {
    const filters = {
      modes: [
        { value: 'ALL', label: 'All Games' },
        { value: 'PARTNERS', label: 'Partners' },
        { value: 'SOLO', label: 'Solo' }
      ],
      formats: [
        { value: 'ALL', label: 'All Formats' },
        { value: 'REGULAR', label: 'Regular' },
        { value: 'WHIZ', label: 'Whiz' },
        { value: 'MIRROR', label: 'Mirror' },
        { value: 'GIMMICK', label: 'Gimmick' }
      ],
      leagueOptions: [
        { value: null, label: 'All Games' },
        { value: true, label: 'League Only' },
        { value: false, label: 'Non-League Only' }
      ],
      gimmickVariants: [
        { value: null, label: 'All Gimmicks' },
        { value: 'SUICIDE', label: 'Suicide' },
        { value: 'BID4NIL', label: 'Bid 4 Nil' },
        { value: 'BID3', label: 'Bid 3' },
        { value: 'BIDHEARTS', label: 'Bid Hearts' },
        { value: 'CRAZY_ACES', label: 'Crazy Aces' }
      ],
      sortOptions: [
        { value: 'winRate', label: 'Win Rate' },
        { value: 'gamesPlayed', label: 'Games Played' },
        { value: 'totalCoins', label: 'Total Coins' }
      ]
    };

    res.json({
      success: true,
      data: filters
    });

  } catch (error) {
    console.error('[STATS API] Error getting filter options:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get filter options' 
    });
  }
});

export { router as statsRoutes };
