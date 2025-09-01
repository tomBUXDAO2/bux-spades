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
        Game: {
          select: { gameMode: true, bidType: true, specialRules: true, screamer: true, assassin: true, status: true }
        }
      }
    });
    
    console.log('[USER STATS API] Found games:', games.length);
    
    // Filter games based on gameMode if specified
    let filteredGames = games;
    if (gameMode && gameMode !== 'ALL') {
      filteredGames = games.filter(gp => {
        const g = gp.Game as any;
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
      const g = gp.Game as any;
      const mode = g?.gameMode as 'PARTNERS' | 'SOLO' | undefined;
      if (mode === 'PARTNERS') {
        partnersGamesPlayed++;
        if (gp.won) partnersGamesWon++;
      } else if (mode === 'SOLO') {
        soloGamesPlayed++;
        if (gp.won) soloGamesWon++;
      }
      
      // Determine format key from bidType with better logging
      const bidType = (g?.bidType || 'REGULAR') as string;
      const key = bidType.toUpperCase(); // REGULAR | WHIZ | MIRROR(S) | GIMMICK
      const normalized = key === 'MIRROR' ? 'MIRRORS' : key;
      
      console.log(`[USER STATS API] Game ${g?.id}: bidType=${bidType}, normalized=${normalized}, won=${gp.won}`);
      
      // Ensure we have a valid category
      if (!fmt[normalized]) {
        console.log(`[USER STATS API] Unknown bidType: ${bidType}, defaulting to REGULAR`);
        fmt['REGULAR'].played++;
        if (gp.won) fmt['REGULAR'].won++;
      } else {
        fmt[normalized].played++;
        if (gp.won) fmt[normalized].won++;
      }
      
      // Special rules
      const hasScreamer = g?.screamer === true || (Array.isArray(g?.specialRules) && g.specialRules.includes('SCREAMER'));
      const hasAssassin = g?.assassin === true || (Array.isArray(g?.specialRules) && g.specialRules.includes('ASSASSIN'));
      if (hasScreamer) {
        special.SCREAMER.played++;
        if (gp.won) special.SCREAMER.won++;
      }
      if (hasAssassin) {
        special.ASSASSIN.played++;
        if (gp.won) special.ASSASSIN.won++;
      }
    }
    
    // Log the breakdown totals for debugging
    console.log('[USER STATS API] Format breakdown totals:', {
      REGULAR: fmt.REGULAR,
      WHIZ: fmt.WHIZ,
      MIRRORS: fmt.MIRRORS,
      GIMMICK: fmt.GIMMICK,
      totalWon: fmt.REGULAR.won + fmt.WHIZ.won + fmt.MIRRORS.won + fmt.GIMMICK.won,
      totalPlayed: fmt.REGULAR.played + fmt.WHIZ.played + fmt.MIRRORS.played + fmt.GIMMICK.played
    });
    
    // Calculate bag counts from filtered games
    let totalBagsFromFiltered = 0;
    for (const gp of filteredGames) {
      totalBagsFromFiltered += gp.bags || 0;
    }

    // Determine which stats to return based on gameMode
    let responseStats;
    if (gameMode === 'PARTNERS') {
      responseStats = {
        gamesPlayed: partnersGamesPlayed, // Use actual count from filtered games
        gamesWon: partnersGamesWon, // Use actual count from filtered games
        totalBags: totalBagsFromFiltered, // Use actual bags from filtered games
        bagsPerGame: partnersGamesPlayed > 0 ? totalBagsFromFiltered / partnersGamesPlayed : 0,
        nilsBid: 0, // Will calculate from filtered games
        nilsMade: 0, // Will calculate from filtered games
        blindNilsBid: 0, // Will calculate from filtered games
        blindNilsMade: 0, // Will calculate from filtered games
      };
    } else if (gameMode === 'SOLO') {
      responseStats = {
        gamesPlayed: soloGamesPlayed, // Use actual count from filtered games
        gamesWon: soloGamesWon, // Use actual count from filtered games
        totalBags: totalBagsFromFiltered, // Use actual bags from filtered games
        bagsPerGame: soloGamesPlayed > 0 ? totalBagsFromFiltered / soloGamesPlayed : 0,
        nilsBid: 0, // Will calculate from filtered games
        nilsMade: 0, // Will calculate from filtered games
        blindNilsBid: 0, // Will calculate from filtered games
        blindNilsMade: 0, // Will calculate from filtered games
      };
    } else {
      // ALL games - use overall stats but ensure they match the actual game count
      const totalGamesFromFiltered = partnersGamesPlayed + soloGamesPlayed;
      const totalWinsFromFiltered = partnersGamesWon + soloGamesWon;
      responseStats = {
        gamesPlayed: totalGamesFromFiltered, // Use actual count from filtered games
        gamesWon: totalWinsFromFiltered, // Use actual count from filtered games
        totalBags: totalBagsFromFiltered, // Use actual bags from filtered games
        bagsPerGame: totalGamesFromFiltered > 0 ? totalBagsFromFiltered / totalGamesFromFiltered : 0,
        nilsBid: stats.nilsBid,
        nilsMade: stats.nilsMade,
        blindNilsBid: stats.blindNilsBid,
        blindNilsMade: stats.blindNilsMade,
      };
    }
    
    // For PARTNERS and SOLO modes, we need to calculate nil stats from the filtered games
    if (gameMode === 'PARTNERS' || gameMode === 'SOLO') {
      // Calculate nil stats proportionally based on filtered games vs total games
      const totalGames = stats.gamesPlayed || 1; // Avoid division by zero
      const filteredGamesCount = filteredGames.length;
      
      if (filteredGamesCount > 0) {
        // Calculate the proportion of nil stats that should belong to this game mode
        const proportion = filteredGamesCount / totalGames;
        
        responseStats.nilsBid = Math.round(stats.nilsBid * proportion);
        responseStats.nilsMade = Math.round(stats.nilsMade * proportion);
        responseStats.blindNilsBid = Math.round(stats.blindNilsBid * proportion);
        responseStats.blindNilsMade = Math.round(stats.blindNilsMade * proportion);
      } else {
        // No games of this mode, so no nil stats
        responseStats.nilsBid = 0;
        responseStats.nilsMade = 0;
        responseStats.blindNilsBid = 0;
        responseStats.blindNilsMade = 0;
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