import { Router } from 'express';
import { requireAuth } from '../../../middleware/auth.middleware';
import { prismaNew } from '../../../newdb/client';

const router = Router();

// GET /api/users/:id/stats - return UserStats for a user
router.get('/:id/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.params.id;
    const gameMode = req.query.gameMode as 'PARTNERS' | 'SOLO' | 'ALL' | undefined;
    
    console.log('[USER STATS API] Request received:', { userId, gameMode, query: req.query });
    
    // NEW DB only: return coins from User and placeholder stats until breakdown tables populated
    const userNew = await prismaNew.user.findUnique({ where: { id: userId } });
    if (!userNew) return res.status(404).json({ message: 'User not found' });
    
    res.json({
      stats: {
        gamesPlayed: 0,
        gamesWon: 0,
        nilsBid: 0,
        nilsMade: 0,
        blindNilsBid: 0,
        blindNilsMade: 0,
        totalBags: 0,
        bagsPerGame: 0
      },
      coins: userNew.coins ?? 0
    });
  } catch (error) {
    console.error('[USER STATS API] Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
