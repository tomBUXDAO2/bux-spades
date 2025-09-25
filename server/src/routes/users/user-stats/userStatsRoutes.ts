import { Router } from 'express';
import { requireAuth } from '../../../middleware/auth.middleware';
import { prisma } from '../../../lib/prisma';

const router = Router();

// GET /api/users/:id/stats - return UserStats for a user
router.get('/:id/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.params.id;
    const mode = req.query.mode as 'PARTNERS' | 'SOLO' | 'ALL' | undefined;
    
    console.log('[USER STATS API] Request received:', { userId, mode, query: req.query });
    
    // Get user and their stats from NEW DB
    const [user, userStats] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.userStats.findUnique({ where: { userId } })
    ]);
    
    console.log('[USER STATS API] User found:', !!user);
    console.log('[USER STATS API] UserStats found:', !!userStats);
    if (userStats) {
      console.log('[USER STATS API] UserStats data:', {
        totalGamesPlayed: userStats.totalGamesPlayed,
        totalGamesWon: userStats.totalGamesWon,
        totalBags: userStats.totalBags
      });
    }
    
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    // If no stats exist, return default values
    if (!userStats) {
      console.log('[USER STATS API] No UserStats found, returning defaults');
      return res.json({
        stats: {
          totalGamesPlayed: 0,
          totalGamesWon: 0,
          winPct: 0,
          nilsBid: 0,
          nilsMade: 0,
          nilPct: 0,
          blindNilsBid: 0,
          blindNilsMade: 0,
          blindNilPct: 0,
          totalBags: 0,
          bagsPerGame: 0,
          // Format breakdowns
          regPlayed: 0,
          regWon: 0,
          regWinPct: 0,
          whizPlayed: 0,
          whizWon: 0,
          whizWinPct: 0,
          mirrorPlayed: 0,
          mirrorWon: 0,
          mirrorWinPct: 0,
          gimmickPlayed: 0,
          gimmickWon: 0,
          gimmickWinPct: 0,
          screamerPlayed: 0,
          screamerWon: 0,
          screamerWinPct: 0,
          assassinPlayed: 0,
          assassinWon: 0,
          assassinWinPct: 0,
          // League stats
          leagueGamesPlayed: 0,
          leagueGamesWon: 0,
          leagueWinPct: 0,
          leagueBags: 0,
          leagueBagsPerGame: 0,
          leagueNilsBid: 0,
          leagueNilsMade: 0,
          leagueNilPct: 0,
          leagueBlindNilsBid: 0,
          leagueBlindNilsMade: 0,
          leagueBlindNilPct: 0,
          leagueRegPlayed: 0,
          leagueRegWon: 0,
          leagueRegWinPct: 0,
          leagueWhizPlayed: 0,
          leagueWhizWon: 0,
          leagueWhizWinPct: 0,
          leagueMirrorPlayed: 0,
          leagueMirrorWon: 0,
          leagueMirrorWinPct: 0,
          leagueGimmickPlayed: 0,
          leagueGimmickWon: 0,
          leagueGimmickWinPct: 0,
          leagueScreamerPlayed: 0,
          leagueScreamerWon: 0,
          leagueScreamerWinPct: 0,
          leagueAssassinPlayed: 0,
          leagueAssassinWon: 0,
          leagueAssassinWinPct: 0,
          // Partners stats
          partnersGamesPlayed: 0,
          partnersGamesWon: 0,
          partnersWinPct: 0,
          partnersBags: 0,
          partnersBagsPerGame: 0,
          partnersNilsBid: 0,
          partnersNilsMade: 0,
          partnersNilPct: 0,
          partnersBlindNilsBid: 0,
          partnersBlindNilsMade: 0,
          partnersBlindNilPct: 0,
          partnersRegPlayed: 0,
          partnersRegWon: 0,
          partnersRegWinPct: 0,
          partnersWhizPlayed: 0,
          partnersWhizWon: 0,
          partnersWhizWinPct: 0,
          partnersMirrorPlayed: 0,
          partnersMirrorWon: 0,
          partnersMirrorWinPct: 0,
          partnersGimmickPlayed: 0,
          partnersGimmickWon: 0,
          partnersGimmickWinPct: 0,
          partnersScreamerPlayed: 0,
          partnersScreamerWon: 0,
          partnersScreamerWinPct: 0,
          partnersAssassinPlayed: 0,
          partnersAssassinWon: 0,
          partnersAssassinWinPct: 0,
          // Solo stats
          soloGamesPlayed: 0,
          soloGamesWon: 0,
          soloWinPct: 0,
          soloBags: 0,
          soloBagsPerGame: 0,
          soloNilsBid: 0,
          soloNilsMade: 0,
          soloNilPct: 0,
          soloBlindNilsBid: 0,
          soloBlindNilsMade: 0,
          soloBlindNilPct: 0,
          soloRegPlayed: 0,
          soloRegWon: 0,
          soloRegWinPct: 0,
          soloWhizPlayed: 0,
          soloWhizWon: 0,
          soloWhizWinPct: 0,
          soloMirrorPlayed: 0,
          soloMirrorWon: 0,
          soloMirrorWinPct: 0,
          soloGimmickPlayed: 0,
          soloGimmickWon: 0,
          soloGimmickWinPct: 0,
          soloScreamerPlayed: 0,
          soloScreamerWon: 0,
          soloScreamerWinPct: 0,
          soloAssassinPlayed: 0,
          soloAssassinWon: 0,
          soloAssassinWinPct: 0
        },
        coins: user.coins ?? 0
      });
    }
    
    console.log('[USER STATS API] Returning UserStats data');

    // Respond with mode-specific stats including breakdowns
    if (mode === 'PARTNERS' || mode === 'SOLO' || mode === 'ALL') {
      const prefix = mode === 'PARTNERS' ? 'partners' : (mode === 'SOLO' ? 'solo' : 'total');
      const get = (name: string) => (userStats as any)[`${prefix}${name}`] || 0;
      const playedWon = (played: number, won: number) => played > 0 ? Math.round((won / played) * 10000) / 100 : 0;

      const modeStats = {
        // Core
        totalGamesPlayed: get('GamesPlayed'),
        totalGamesWon: get('GamesWon'),
        winPct: playedWon(get('GamesPlayed'), get('GamesWon')),
        nilsBid: get('NilsBid'),
        nilsMade: get('NilsMade'),
        nilPct: playedWon(get('NilsBid'), get('NilsMade')),
        blindNilsBid: get('BlindNilsBid'),
        blindNilsMade: get('BlindNilsMade'),
        blindNilPct: playedWon(get('BlindNilsBid'), get('BlindNilsMade')),
        totalBags: get('Bags'),
        bagsPerGame: get('GamesPlayed') > 0 ? Math.round((get('Bags') / get('GamesPlayed')) * 100) / 100 : 0,
        // Breakdown - Regular
        regPlayed: get('RegularPlayed'),
        regWon: get('RegularWon'),
        regWinPct: playedWon(get('RegularPlayed'), get('RegularWon')),
        // Breakdown - Whiz
        whizPlayed: get('WhizPlayed'),
        whizWon: get('WhizWon'),
        whizWinPct: playedWon(get('WhizPlayed'), get('WhizWon')),
        // Breakdown - Mirror
        mirrorPlayed: get('MirrorPlayed'),
        mirrorWon: get('MirrorWon'),
        mirrorWinPct: playedWon(get('MirrorPlayed'), get('MirrorWon')),
        // Breakdown - Gimmick
        gimmickPlayed: get('GimmickPlayed'),
        gimmickWon: get('GimmickWon'),
        gimmickWinPct: playedWon(get('GimmickPlayed'), get('GimmickWon')),
        // Breakdown - Screamer
        screamerPlayed: get('ScreamerPlayed'),
        screamerWon: get('ScreamerWon'),
        screamerWinPct: playedWon(get('ScreamerPlayed'), get('ScreamerWon')),
        // Breakdown - Assassin
        assassinPlayed: get('AssassinPlayed'),
        assassinWon: get('AssassinWon'),
        assassinWinPct: playedWon(get('AssassinPlayed'), get('AssassinWon')),
      } as any;

      return res.json({ stats: modeStats, coins: user.coins ?? 0 });
    }


    // If a mode is provided, return only that mode's stats
    if (mode === 'PARTNERS' || mode === 'SOLO' || mode === 'ALL') {
      const mode = mode || 'ALL';
      const getModeSpecificStats = (mode: string) => {
        switch (mode) {
          case 'PARTNERS':
            return {
              totalGamesPlayed: userStats.partnersGamesPlayed,
              totalGamesWon: userStats.partnersGamesWon,
              winPct: userStats.partnersGamesPlayed > 0 ? Math.round((userStats.partnersGamesWon / userStats.partnersGamesPlayed) * 10000) / 100 : 0,
              nilsBid: userStats.partnersNilsBid,
              nilsMade: userStats.partnersNilsMade,
              nilPct: userStats.partnersNilsBid > 0 ? Math.round((userStats.partnersNilsMade / userStats.partnersNilsBid) * 10000) / 100 : 0,
              blindNilsBid: userStats.partnersBlindNilsBid,
              blindNilsMade: userStats.partnersBlindNilsMade,
              blindNilPct: userStats.partnersBlindNilsBid > 0 ? Math.round((userStats.partnersBlindNilsMade / userStats.partnersBlindNilsBid) * 10000) / 100 : 0,
              totalBags: userStats.partnersBags,
              bagsPerGame: userStats.partnersGamesPlayed > 0 ? Math.round((userStats.partnersBags / userStats.partnersGamesPlayed) * 100) / 100 : 0,
            };
          case 'SOLO':
            return {
              totalGamesPlayed: userStats.soloGamesPlayed,
              totalGamesWon: userStats.soloGamesWon,
              winPct: userStats.soloGamesPlayed > 0 ? Math.round((userStats.soloGamesWon / userStats.soloGamesPlayed) * 10000) / 100 : 0,
              nilsBid: userStats.soloNilsBid,
              nilsMade: userStats.soloNilsMade,
              nilPct: userStats.soloNilsBid > 0 ? Math.round((userStats.soloNilsMade / userStats.soloNilsBid) * 10000) / 100 : 0,
              blindNilsBid: userStats.soloBlindNilsBid,
              blindNilsMade: userStats.soloBlindNilsMade,
              blindNilPct: userStats.soloBlindNilsBid > 0 ? Math.round((userStats.soloBlindNilsMade / userStats.soloBlindNilsBid) * 10000) / 100 : 0,
              totalBags: userStats.soloBags,
              bagsPerGame: userStats.soloGamesPlayed > 0 ? Math.round((userStats.soloBags / userStats.soloGamesPlayed) * 100) / 100 : 0,
            };
          case 'ALL':
          default:
            return {
              totalGamesPlayed: userStats.totalGamesPlayed,
              totalGamesWon: userStats.totalGamesWon,
              winPct: userStats.totalGamesPlayed > 0 ? Math.round((userStats.totalGamesWon / userStats.totalGamesPlayed) * 10000) / 100 : 0,
              nilsBid: userStats.totalNilsBid,
              nilsMade: userStats.totalNilsMade,
              nilPct: userStats.totalNilsBid > 0 ? Math.round((userStats.totalNilsMade / userStats.totalNilsBid) * 10000) / 100 : 0,
              blindNilsBid: userStats.totalBlindNilsBid,
              blindNilsMade: userStats.totalBlindNilsMade,
              blindNilPct: userStats.totalBlindNilsBid > 0 ? Math.round((userStats.totalBlindNilsMade / userStats.totalBlindNilsBid) * 10000) / 100 : 0,
              totalBags: userStats.totalBags,
              bagsPerGame: userStats.totalGamesPlayed > 0 ? Math.round((userStats.totalBags / userStats.totalGamesPlayed) * 100) / 100 : 0,
            };
        }
      };
      const modeStats = getModeSpecificStats(mode);
      return res.json({ stats: modeStats, coins: user.coins ?? 0 });
    }

    
    // Calculate percentages
    const totalWinPct = userStats.totalGamesPlayed > 0 ? (userStats.totalGamesWon / userStats.totalGamesPlayed) * 100 : 0;
    const totalBagsPerGame = userStats.totalGamesPlayed > 0 ? userStats.totalBags / userStats.totalGamesPlayed : 0;
    const totalNilPct = userStats.totalNilsBid > 0 ? (userStats.totalNilsMade / userStats.totalNilsBid) * 100 : 0;
    const totalBlindNilPct = userStats.totalBlindNilsBid > 0 ? (userStats.totalBlindNilsMade / userStats.totalBlindNilsBid) * 100 : 0;
    
    // Format percentages
    const regularWinPct = userStats.totalRegularPlayed > 0 ? (userStats.totalRegularWon / userStats.totalRegularPlayed) * 100 : 0;
    const whizWinPct = userStats.totalWhizPlayed > 0 ? (userStats.totalWhizWon / userStats.totalWhizPlayed) * 100 : 0;
    const mirrorWinPct = userStats.totalMirrorPlayed > 0 ? (userStats.totalMirrorWon / userStats.totalMirrorPlayed) * 100 : 0;
    const gimmickWinPct = userStats.totalGimmickPlayed > 0 ? (userStats.totalGimmickWon / userStats.totalGimmickPlayed) * 100 : 0;
    const screamerWinPct = userStats.totalScreamerPlayed > 0 ? (userStats.totalScreamerWon / userStats.totalScreamerPlayed) * 100 : 0;
    const assassinWinPct = userStats.totalAssassinPlayed > 0 ? (userStats.totalAssassinWon / userStats.totalAssassinPlayed) * 100 : 0;
    
    // League percentages
    const leagueWinPct = userStats.leagueGamesPlayed > 0 ? (userStats.leagueGamesWon / userStats.leagueGamesPlayed) * 100 : 0;
    const leagueBagsPerGame = userStats.leagueGamesPlayed > 0 ? userStats.leagueBags / userStats.leagueGamesPlayed : 0;
    const leagueNilPct = userStats.leagueNilsBid > 0 ? (userStats.leagueNilsMade / userStats.leagueNilsBid) * 100 : 0;
    const leagueBlindNilPct = userStats.leagueBlindNilsBid > 0 ? (userStats.leagueBlindNilsMade / userStats.leagueBlindNilsBid) * 100 : 0;
    
    // Partners percentages
    const partnersWinPct = userStats.partnersGamesPlayed > 0 ? (userStats.partnersGamesWon / userStats.partnersGamesPlayed) * 100 : 0;
    const partnersBagsPerGame = userStats.partnersGamesPlayed > 0 ? userStats.partnersBags / userStats.partnersGamesPlayed : 0;
    const partnersNilPct = userStats.partnersNilsBid > 0 ? (userStats.partnersNilsMade / userStats.partnersNilsBid) * 100 : 0;
    const partnersBlindNilPct = userStats.partnersBlindNilsBid > 0 ? (userStats.partnersBlindNilsMade / userStats.partnersBlindNilsBid) * 100 : 0;
    
    // Solo percentages
    const soloWinPct = userStats.soloGamesPlayed > 0 ? (userStats.soloGamesWon / userStats.soloGamesPlayed) * 100 : 0;
    const soloBagsPerGame = userStats.soloGamesPlayed > 0 ? userStats.soloBags / userStats.soloGamesPlayed : 0;
    const soloNilPct = userStats.soloNilsBid > 0 ? (userStats.soloNilsMade / userStats.soloNilsBid) * 100 : 0;
    const soloBlindNilPct = userStats.soloBlindNilsBid > 0 ? (userStats.soloBlindNilsMade / userStats.soloBlindNilsBid) * 100 : 0;
    
    const response = {
      stats: {
        // Overall stats
        totalGamesPlayed: userStats.totalGamesPlayed,
        totalGamesWon: userStats.totalGamesWon,
        winPct: Math.round(totalWinPct * 100) / 100,
        nilsBid: userStats.totalNilsBid,
        nilsMade: userStats.totalNilsMade,
        nilPct: Math.round(totalNilPct * 100) / 100,
        blindNilsBid: userStats.totalBlindNilsBid,
        blindNilsMade: userStats.totalBlindNilsMade,
        blindNilPct: Math.round(totalBlindNilPct * 100) / 100,
        totalBags: userStats.totalBags,
        bagsPerGame: Math.round(totalBagsPerGame * 100) / 100,
        
        // Format breakdowns (using frontend expected field names)
        regPlayed: userStats.totalRegularPlayed,
        regWon: userStats.totalRegularWon,
        regWinPct: Math.round(regularWinPct * 100) / 100,
        whizPlayed: userStats.totalWhizPlayed,
        whizWon: userStats.totalWhizWon,
        whizWinPct: Math.round(whizWinPct * 100) / 100,
        mirrorPlayed: userStats.totalMirrorPlayed,
        mirrorWon: userStats.totalMirrorWon,
        mirrorWinPct: Math.round(mirrorWinPct * 100) / 100,
        gimmickPlayed: userStats.totalGimmickPlayed,
        gimmickWon: userStats.totalGimmickWon,
        gimmickWinPct: Math.round(gimmickWinPct * 100) / 100,
        screamerPlayed: userStats.totalScreamerPlayed,
        screamerWon: userStats.totalScreamerWon,
        screamerWinPct: Math.round(screamerWinPct * 100) / 100,
        assassinPlayed: userStats.totalAssassinPlayed,
        assassinWon: userStats.totalAssassinWon,
        assassinWinPct: Math.round(assassinWinPct * 100) / 100,
        
        // League stats
        leagueGamesPlayed: userStats.leagueGamesPlayed,
        leagueGamesWon: userStats.leagueGamesWon,
        leagueWinPct: Math.round(leagueWinPct * 100) / 100,
        leagueBags: userStats.leagueBags,
        leagueBagsPerGame: Math.round(leagueBagsPerGame * 100) / 100,
        leagueNilsBid: userStats.leagueNilsBid,
        leagueNilsMade: userStats.leagueNilsMade,
        leagueNilPct: Math.round(leagueNilPct * 100) / 100,
        leagueBlindNilsBid: userStats.leagueBlindNilsBid,
        leagueBlindNilsMade: userStats.leagueBlindNilsMade,
        leagueBlindNilPct: Math.round(leagueBlindNilPct * 100) / 100,
        leagueRegPlayed: userStats.leagueRegularPlayed,
        leagueRegWon: userStats.leagueRegularWon,
        leagueRegWinPct: userStats.leagueRegularPlayed > 0 ? Math.round((userStats.leagueRegularWon / userStats.leagueRegularPlayed) * 100 * 100) / 100 : 0,
        leagueWhizPlayed: userStats.leagueWhizPlayed,
        leagueWhizWon: userStats.leagueWhizWon,
        leagueWhizWinPct: userStats.leagueWhizPlayed > 0 ? Math.round((userStats.leagueWhizWon / userStats.leagueWhizPlayed) * 100 * 100) / 100 : 0,
        leagueMirrorPlayed: userStats.leagueMirrorPlayed,
        leagueMirrorWon: userStats.leagueMirrorWon,
        leagueMirrorWinPct: userStats.leagueMirrorPlayed > 0 ? Math.round((userStats.leagueMirrorWon / userStats.leagueMirrorPlayed) * 100 * 100) / 100 : 0,
        leagueGimmickPlayed: userStats.leagueGimmickPlayed,
        leagueGimmickWon: userStats.leagueGimmickWon,
        leagueGimmickWinPct: userStats.leagueGimmickPlayed > 0 ? Math.round((userStats.leagueGimmickWon / userStats.leagueGimmickPlayed) * 100 * 100) / 100 : 0,
        leagueScreamerPlayed: userStats.leagueScreamerPlayed,
        leagueScreamerWon: userStats.leagueScreamerWon,
        leagueScreamerWinPct: userStats.leagueScreamerPlayed > 0 ? Math.round((userStats.leagueScreamerWon / userStats.leagueScreamerPlayed) * 100 * 100) / 100 : 0,
        leagueAssassinPlayed: userStats.leagueAssassinPlayed,
        leagueAssassinWon: userStats.leagueAssassinWon,
        leagueAssassinWinPct: userStats.leagueAssassinPlayed > 0 ? Math.round((userStats.leagueAssassinWon / userStats.leagueAssassinPlayed) * 100 * 100) / 100 : 0,
        
        // Partners stats
        partnersGamesPlayed: userStats.partnersGamesPlayed,
        partnersGamesWon: userStats.partnersGamesWon,
        partnersWinPct: Math.round(partnersWinPct * 100) / 100,
        partnersBags: userStats.partnersBags,
        partnersBagsPerGame: Math.round(partnersBagsPerGame * 100) / 100,
        partnersNilsBid: userStats.partnersNilsBid,
        partnersNilsMade: userStats.partnersNilsMade,
        partnersNilPct: Math.round(partnersNilPct * 100) / 100,
        partnersBlindNilsBid: userStats.partnersBlindNilsBid,
        partnersBlindNilsMade: userStats.partnersBlindNilsMade,
        partnersBlindNilPct: Math.round(partnersBlindNilPct * 100) / 100,
        partnersRegPlayed: userStats.partnersRegularPlayed,
        partnersRegWon: userStats.partnersRegularWon,
        partnersRegWinPct: userStats.partnersRegularPlayed > 0 ? Math.round((userStats.partnersRegularWon / userStats.partnersRegularPlayed) * 100 * 100) / 100 : 0,
        partnersWhizPlayed: userStats.partnersWhizPlayed,
        partnersWhizWon: userStats.partnersWhizWon,
        partnersWhizWinPct: userStats.partnersWhizPlayed > 0 ? Math.round((userStats.partnersWhizWon / userStats.partnersWhizPlayed) * 100 * 100) / 100 : 0,
        partnersMirrorPlayed: userStats.partnersMirrorPlayed,
        partnersMirrorWon: userStats.partnersMirrorWon,
        partnersMirrorWinPct: userStats.partnersMirrorPlayed > 0 ? Math.round((userStats.partnersMirrorWon / userStats.partnersMirrorPlayed) * 100 * 100) / 100 : 0,
        partnersGimmickPlayed: userStats.partnersGimmickPlayed,
        partnersGimmickWon: userStats.partnersGimmickWon,
        partnersGimmickWinPct: userStats.partnersGimmickPlayed > 0 ? Math.round((userStats.partnersGimmickWon / userStats.partnersGimmickPlayed) * 100 * 100) / 100 : 0,
        partnersScreamerPlayed: userStats.partnersScreamerPlayed,
        partnersScreamerWon: userStats.partnersScreamerWon,
        partnersScreamerWinPct: userStats.partnersScreamerPlayed > 0 ? Math.round((userStats.partnersScreamerWon / userStats.partnersScreamerPlayed) * 100 * 100) / 100 : 0,
        partnersAssassinPlayed: userStats.partnersAssassinPlayed,
        partnersAssassinWon: userStats.partnersAssassinWon,
        partnersAssassinWinPct: userStats.partnersAssassinPlayed > 0 ? Math.round((userStats.partnersAssassinWon / userStats.partnersAssassinPlayed) * 100 * 100) / 100 : 0,
        
        // Solo stats
        soloGamesPlayed: userStats.soloGamesPlayed,
        soloGamesWon: userStats.soloGamesWon,
        soloWinPct: Math.round(soloWinPct * 100) / 100,
        soloBags: userStats.soloBags,
        soloBagsPerGame: Math.round(soloBagsPerGame * 100) / 100,
        soloNilsBid: userStats.soloNilsBid,
        soloNilsMade: userStats.soloNilsMade,
        soloNilPct: Math.round(soloNilPct * 100) / 100,
        soloBlindNilsBid: userStats.soloBlindNilsBid,
        soloBlindNilsMade: userStats.soloBlindNilsMade,
        soloBlindNilPct: Math.round(soloBlindNilPct * 100) / 100,
        soloRegPlayed: userStats.soloRegularPlayed,
        soloRegWon: userStats.soloRegularWon,
        soloRegWinPct: userStats.soloRegularPlayed > 0 ? Math.round((userStats.soloRegularWon / userStats.soloRegularPlayed) * 100 * 100) / 100 : 0,
        soloWhizPlayed: userStats.soloWhizPlayed,
        soloWhizWon: userStats.soloWhizWon,
        soloWhizWinPct: userStats.soloWhizPlayed > 0 ? Math.round((userStats.soloWhizWon / userStats.soloWhizPlayed) * 100 * 100) / 100 : 0,
        soloMirrorPlayed: userStats.soloMirrorPlayed,
        soloMirrorWon: userStats.soloMirrorWon,
        soloMirrorWinPct: userStats.soloMirrorPlayed > 0 ? Math.round((userStats.soloMirrorWon / userStats.soloMirrorPlayed) * 100 * 100) / 100 : 0,
        soloGimmickPlayed: userStats.soloGimmickPlayed,
        soloGimmickWon: userStats.soloGimmickWon,
        soloGimmickWinPct: userStats.soloGimmickPlayed > 0 ? Math.round((userStats.soloGimmickWon / userStats.soloGimmickPlayed) * 100 * 100) / 100 : 0,
        soloScreamerPlayed: userStats.soloScreamerPlayed,
        soloScreamerWon: userStats.soloScreamerWon,
        soloScreamerWinPct: userStats.soloScreamerPlayed > 0 ? Math.round((userStats.soloScreamerWon / userStats.soloScreamerPlayed) * 100 * 100) / 100 : 0,
        soloAssassinPlayed: userStats.soloAssassinPlayed,
        soloAssassinWon: userStats.soloAssassinWon,
        soloAssassinWinPct: userStats.soloAssassinPlayed > 0 ? Math.round((userStats.soloAssassinWon / userStats.soloAssassinPlayed) * 100 * 100) / 100 : 0
      },
      coins: user.coins ?? 0
    };
    
    console.log('[USER STATS API] Response data:', {
      totalGamesPlayed: response.stats.totalGamesPlayed,
      totalGamesWon: response.stats.totalGamesWon,
      winPct: response.stats.winPct,
      totalBags: response.stats.totalBags
    });
    
    res.json(response);
  } catch (error) {
    console.error('[USER STATS API] Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
