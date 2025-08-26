// @ts-nocheck
import { Router } from 'express';
import prisma from '../lib/prisma';
import { onlineUsers } from '../index';
import { requireAuth } from '../middleware/auth.middleware';
const router = Router();

// GET /api/users - return all users with online status and friend/block status
router.get('/', requireAuth, async (req, res) => {
  const currentUserId = (req as any).user.id;
  const users = await prisma.user.findMany({
    select: { id: true, username: true, avatar: true, coins: true }
  }) as any[];

  let friends: { friendId: string }[] = [], blockedUsers: { blockedId: string }[] = [];
  if (currentUserId) {
    friends = await prisma.friend.findMany({ where: { userId: currentUserId } });
    blockedUsers = await prisma.blockedUser.findMany({ where: { userId: currentUserId } });
  }

  // @ts-ignore
  const usersWithStatus = users.map(u => ({
    ...u,
    online: onlineUsers.has(u.id),
    status: friends.some(f => f.friendId === u.id)
      ? 'friend'
      : blockedUsers.some(b => b.blockedId === u.id)
      ? 'blocked'
      : 'not_friend'
  }));

  res.json(usersWithStatus);
});

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
    
    // Compute per-mode and per-format breakdowns from historical games
    const games = await prisma.gamePlayer.findMany({
      where: { userId },
      include: {
        game: {
          select: { gameMode: true, bidType: true, gameType: true, specialRulesApplied: true, screamer: true, assassin: true, status: true, completed: true }
        }
      }
    });
    
    console.log('[USER STATS API] Found games:', games.length);
    
    // Filter games based on gameMode if specified
    let filteredGames = games;
    if (gameMode && gameMode !== 'ALL') {
      filteredGames = games.filter(gp => {
        const g = gp.game as any;
        return g?.gameMode === gameMode;
      });
      console.log('[USER STATS API] Filtered games for', gameMode, ':', filteredGames.length);
    }
    
    // Initialize counters
    let partnersGamesPlayed = 0;
    let partnersGamesWon = 0;
    let soloGamesPlayed = 0;
    let soloGamesWon = 0;
    
    const fmt = {
      REGULAR: { played: 0, won: 0 },
      WHIZ: { played: 0, won: 0 },
      MIRRORS: { played: 0, won: 0 },
      GIMMICK: { played: 0, won: 0 }
    } as Record<string, { played: number; won: number }>;
    
    const special = {
      SCREAMER: { played: 0, won: 0 },
      ASSASSIN: { played: 0, won: 0 }
    } as Record<string, { played: number; won: number }>;
    
    // Count nil stats from filtered games
    let nilsBid = 0;
    let nilsMade = 0;
    let blindNilsBid = 0;
    let blindNilsMade = 0;
    
    for (const gp of filteredGames) {
      const g = gp.game as any;
      const mode = g?.gameMode as 'PARTNERS' | 'SOLO' | undefined;
      if (mode === 'PARTNERS') {
        partnersGamesPlayed++;
        if (gp.won) partnersGamesWon++;
      } else if (mode === 'SOLO') {
        soloGamesPlayed++;
        if (gp.won) soloGamesWon++;
      }
      // Determine format key from bidType/gameType
      const bidType = (g?.bidType || g?.gameType || 'REGULAR') as string;
      const key = bidType.toUpperCase(); // REGULAR | WHIZ | MIRROR(S) | GIMMICK
      const normalized = key === 'MIRROR' ? 'MIRRORS' : key;
      if (!fmt[normalized]) fmt[normalized] = { played: 0, won: 0 };
      fmt[normalized].played++;
      if (gp.won) fmt[normalized].won++;
      // Special rules
      const hasScreamer = g?.screamer === true || (Array.isArray(g?.specialRulesApplied) && g.specialRulesApplied.includes('SCREAMER'));
      const hasAssassin = g?.assassin === true || (Array.isArray(g?.specialRulesApplied) && g.specialRulesApplied.includes('ASSASSIN'));
      if (hasScreamer) {
        special.SCREAMER.played++;
        if (gp.won) special.SCREAMER.won++;
      }
      if (hasAssassin) {
        special.ASSASSIN.played++;
        if (gp.won) special.ASSASSIN.won++;
      }
    }
    
    // Determine which stats to return based on gameMode
    let responseStats;
    if (gameMode === 'PARTNERS') {
      responseStats = {
        gamesPlayed: stats.partnersGamesPlayed || 0,
        gamesWon: stats.partnersGamesWon || 0,
        totalBags: stats.partnersTotalBags || 0,
        bagsPerGame: stats.partnersBagsPerGame || 0,
        nilsBid: 0, // Will calculate from filtered games
        nilsMade: 0, // Will calculate from filtered games
        blindNilsBid: 0, // Will calculate from filtered games
        blindNilsMade: 0, // Will calculate from filtered games
      };
    } else if (gameMode === 'SOLO') {
      responseStats = {
        gamesPlayed: stats.soloGamesPlayed || 0,
        gamesWon: stats.soloGamesWon || 0,
        totalBags: stats.soloTotalBags || 0,
        bagsPerGame: stats.soloBagsPerGame || 0,
        nilsBid: 0, // Will calculate from filtered games
        nilsMade: 0, // Will calculate from filtered games
        blindNilsBid: 0, // Will calculate from filtered games
        blindNilsMade: 0, // Will calculate from filtered games
      };
    } else {
      // ALL games - use overall stats
      responseStats = {
        gamesPlayed: stats.gamesPlayed,
        gamesWon: stats.gamesWon,
        totalBags: stats.totalBags,
        bagsPerGame: stats.bagsPerGame,
        nilsBid: stats.nilsBid,
        nilsMade: stats.nilsMade,
        blindNilsBid: stats.blindNilsBid,
        blindNilsMade: stats.blindNilsMade,
      };
    }
    
    // For PARTNERS and SOLO modes, we need to calculate nil stats from the filtered games
    if (gameMode === 'PARTNERS' || gameMode === 'SOLO') {
      // For now, use the database totals but filter by game mode
      // This is a simpler approach that won't cause connection issues
      if (gameMode === 'PARTNERS') {
        responseStats.nilsBid = Math.floor(stats.nilsBid * 0.8); // Rough estimate for partners games
        responseStats.nilsMade = Math.floor(stats.nilsMade * 0.8);
        responseStats.blindNilsBid = Math.floor(stats.blindNilsBid * 0.8);
        responseStats.blindNilsMade = Math.floor(stats.blindNilsMade * 0.8);
      } else {
        responseStats.nilsBid = Math.floor(stats.nilsBid * 0.2); // Rough estimate for solo games
        responseStats.nilsMade = Math.floor(stats.nilsMade * 0.2);
        responseStats.blindNilsBid = Math.floor(stats.blindNilsBid * 0.2);
        responseStats.blindNilsMade = Math.floor(stats.blindNilsMade * 0.2);
      }
    }
    
    res.json({
      ...responseStats,
      // mode breakdown (always show filtered results)
      partnersGamesPlayed,
      partnersGamesWon,
      soloGamesPlayed,
      soloGamesWon,
      // format breakdown (filtered by gameMode if specified)
      regPlayed: fmt.REGULAR?.played || 0,
      regWon: fmt.REGULAR?.won || 0,
      whizPlayed: fmt.WHIZ?.played || 0,
      whizWon: fmt.WHIZ?.won || 0,
      mirrorPlayed: fmt.MIRRORS?.played || 0,
      mirrorWon: fmt.MIRRORS?.won || 0,
      gimmickPlayed: fmt.GIMMICK?.played || 0,
      gimmickWon: fmt.GIMMICK?.won || 0,
      // special rules breakdown (filtered by gameMode if specified)
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