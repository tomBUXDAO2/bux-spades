import { prisma } from '../lib/prisma';

export async function calculateAndStoreUserStats(gameId: string): Promise<void> {
  
  try {
    // Load game data
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        isLeague: true,
        mode: true,
        format: true,
        gimmickVariant: true,
        specialRules: true
      }
    });

    if (!game) {
      console.log('[USER STATS] Game not found for stats:', gameId);
      return;
    }

    // Load players
    const gamePlayers = await prisma.gamePlayer.findMany({
      where: { gameId },
      select: { userId: true, seatIndex: true, teamIndex: true, isHuman: true }
    });

    // Load round IDs for this game
    const rounds = await prisma.round.findMany({
      where: { gameId },
      select: { id: true }
    });
    const roundIds = rounds.map(r => r.id);

    // Load round stats used to compute per-player totals
    const playerRoundStats = roundIds.length > 0 ? await prisma.playerRoundStats.findMany({
      where: { roundId: { in: roundIds } as any },
      select: { roundId: true, userId: true, seatIndex: true, teamIndex: true, bid: true, tricksWon: true, bagsThisRound: true, madeNil: true, madeBlindNil: true }
    }) : [];

    // Load final game result for winner
    const gameResult = await prisma.gameResult.findUnique({ where: { gameId } });
    if (!gameResult) {
      console.log('[USER STATS] Game result not found for game:', gameId);
      return;
    }

    // Calculate stats for each human player
    for (const gamePlayer of gamePlayers) {
      if (!gamePlayer.isHuman) continue;

      const userId = gamePlayer.userId;
      const isLeague = game.isLeague;
      const mode = game.mode;
      const format = game.format;
      const gimmickVariant = game.gimmickVariant;
      const special = (game as any).specialRules || {};
      const hasScreamer = Boolean(special?.screamer);
      const hasAssassin = Boolean(special?.assassin);

      // Get all rounds for this player
      const playerRounds = playerRoundStats.filter(prs => prs.userId === userId);

      // Calculate basic stats
      const totalGamesPlayed = 1;
      const totalGamesWon = determineIfWon(gamePlayer, gameResult, game.mode);
      const totalBags = playerRounds.reduce((sum, prs) => sum + prs.bagsThisRound, 0);
      const nilsBid = playerRounds.filter(prs => prs.bid === 0).length;
      const nilsMade = playerRounds.filter(prs => prs.bid === 0 && prs.madeNil).length;
      const blindNilsBid = playerRounds.filter(prs => prs.bid === -1).length;
      const blindNilsMade = playerRounds.filter(prs => prs.bid === -1 && prs.madeBlindNil).length;

      console.log(`[USER STATS] Processing user ${userId}: totalGamesPlayed=${totalGamesPlayed}, totalGamesWon=${totalGamesWon}, totalBags=${totalBags}`);

      // Get or create user stats record
      let userStats = await prisma.userStats.findUnique({ where: { userId } });
      if (!userStats) {
        userStats = await prisma.userStats.create({ data: { userId } });
      }

      // Update all relevant fields
      const updateData: any = {
        totalGamesPlayed: { increment: totalGamesPlayed },
        totalGamesWon: { increment: totalGamesWon },
        totalBags: { increment: totalBags },
        totalNilsBid: { increment: nilsBid },
        totalNilsMade: { increment: nilsMade },
        totalBlindNilsBid: { increment: blindNilsBid },
        totalBlindNilsMade: { increment: blindNilsMade }
      };

      // Add league-specific updates
      if (isLeague) {
        updateData.leagueGamesPlayed = { increment: totalGamesPlayed };
        updateData.leagueGamesWon = { increment: totalGamesWon };
        updateData.leagueBags = { increment: totalBags };
        updateData.leagueNilsBid = { increment: nilsBid };
        updateData.leagueNilsMade = { increment: nilsMade };
        updateData.leagueBlindNilsBid = { increment: blindNilsBid };
        updateData.leagueBlindNilsMade = { increment: blindNilsMade };
      }

      // Add mode-specific bags counters
      if (mode === 'PARTNERS') {
        updateData.partnersGamesPlayed = { increment: totalGamesPlayed };
        updateData.partnersGamesWon = { increment: totalGamesWon };
        updateData.partnersBags = { increment: totalBags };
        updateData.partnersNilsBid = { increment: nilsBid };
        updateData.partnersNilsMade = { increment: nilsMade };
        updateData.partnersBlindNilsBid = { increment: blindNilsBid };
        updateData.partnersBlindNilsMade = { increment: blindNilsMade };
      } else if (mode === 'SOLO') {
        updateData.soloGamesPlayed = { increment: totalGamesPlayed };
        updateData.soloGamesWon = { increment: totalGamesWon };
        updateData.soloBags = { increment: totalBags };
        updateData.soloNilsBid = { increment: nilsBid };
        updateData.soloNilsMade = { increment: nilsMade };
        updateData.soloBlindNilsBid = { increment: blindNilsBid };
        updateData.soloBlindNilsMade = { increment: blindNilsMade };
      }

      // Add format-specific updates
      if (format === 'REGULAR') {
        updateData.totalRegularPlayed = { increment: totalGamesPlayed };
        updateData.totalRegularWon = { increment: totalGamesWon };
        if (isLeague) {
          updateData.leagueRegularPlayed = { increment: totalGamesPlayed };
          updateData.leagueRegularWon = { increment: totalGamesWon };
        }
        if (mode === 'PARTNERS') {
          updateData.partnersRegularPlayed = { increment: totalGamesPlayed };
          updateData.partnersRegularWon = { increment: totalGamesWon };
        } else if (mode === 'SOLO') {
          updateData.soloRegularPlayed = { increment: totalGamesPlayed };
          updateData.soloRegularWon = { increment: totalGamesWon };
        }
      } else if (format === 'WHIZ') {
        updateData.totalWhizPlayed = { increment: totalGamesPlayed };
        updateData.totalWhizWon = { increment: totalGamesWon };
        if (isLeague) {
          updateData.leagueWhizPlayed = { increment: totalGamesPlayed };
          updateData.leagueWhizWon = { increment: totalGamesWon };
        }
        if (mode === 'PARTNERS') {
          updateData.partnersWhizPlayed = { increment: totalGamesPlayed };
          updateData.partnersWhizWon = { increment: totalGamesWon };
        } else if (mode === 'SOLO') {
          updateData.soloWhizPlayed = { increment: totalGamesPlayed };
          updateData.soloWhizWon = { increment: totalGamesWon };
        }
      } else if (format === 'MIRROR') {
        updateData.totalMirrorPlayed = { increment: totalGamesPlayed };
        updateData.totalMirrorWon = { increment: totalGamesWon };
        if (isLeague) {
          updateData.leagueMirrorPlayed = { increment: totalGamesPlayed };
          updateData.leagueMirrorWon = { increment: totalGamesWon };
        }
        if (mode === 'PARTNERS') {
          updateData.partnersMirrorPlayed = { increment: totalGamesPlayed };
          updateData.partnersMirrorWon = { increment: totalGamesWon };
        } else if (mode === 'SOLO') {
          updateData.soloMirrorPlayed = { increment: totalGamesPlayed };
          updateData.soloMirrorWon = { increment: totalGamesWon };
        }
      } else if (format === 'GIMMICK') {
        updateData.totalGimmickPlayed = { increment: totalGamesPlayed };
        updateData.totalGimmickWon = { increment: totalGamesWon };
        if (isLeague) {
          updateData.leagueGimmickPlayed = { increment: totalGamesPlayed };
          updateData.leagueGimmickWon = { increment: totalGamesWon };
        }
        if (mode === 'PARTNERS') {
          updateData.partnersGimmickPlayed = { increment: totalGamesPlayed };
          updateData.partnersGimmickWon = { increment: totalGamesWon };
        } else if (mode === 'SOLO') {
          updateData.soloGimmickPlayed = { increment: totalGamesPlayed };
          updateData.soloGimmickWon = { increment: totalGamesWon };
        }
      }

      // Special rules: Screamer / Assassin
      if (hasScreamer) {
        updateData.totalScreamerPlayed = { increment: totalGamesPlayed };
        updateData.totalScreamerWon = { increment: totalGamesWon };
        if (isLeague) {
          updateData.leagueScreamerPlayed = { increment: totalGamesPlayed };
          updateData.leagueScreamerWon = { increment: totalGamesWon };
        }
        if (mode === 'PARTNERS') {
          updateData.partnersScreamerPlayed = { increment: totalGamesPlayed };
          updateData.partnersScreamerWon = { increment: totalGamesWon };
        } else if (mode === 'SOLO') {
          updateData.soloScreamerPlayed = { increment: totalGamesPlayed };
          updateData.soloScreamerWon = { increment: totalGamesWon };
        }
      }

      if (hasAssassin) {
        updateData.totalAssassinPlayed = { increment: totalGamesPlayed };
        updateData.totalAssassinWon = { increment: totalGamesWon };
        if (isLeague) {
          updateData.leagueAssassinPlayed = { increment: totalGamesPlayed };
          updateData.leagueAssassinWon = { increment: totalGamesWon };
        }
        if (mode === 'PARTNERS') {
          updateData.partnersAssassinPlayed = { increment: totalGamesPlayed };
          updateData.partnersAssassinWon = { increment: totalGamesWon };
        } else if (mode === 'SOLO') {
          updateData.soloAssassinPlayed = { increment: totalGamesPlayed };
          updateData.soloAssassinWon = { increment: totalGamesWon };
        }
      }

      // Update the user stats (counters)
      await prisma.userStats.update({
        where: { userId },
        data: updateData
      });

      // Recalculate and persist bags-per-game fields based on current totals
      const refreshed = await prisma.userStats.findUnique({ where: { userId } });
      if (refreshed) {
        const totalsForBagsPerGame = {
          totalBagsPerGame: refreshed.totalGamesPlayed > 0 ? refreshed.totalBags / refreshed.totalGamesPlayed : 0,
          leagueBagsPerGame: refreshed.leagueGamesPlayed > 0 ? refreshed.leagueBags / refreshed.leagueGamesPlayed : 0,
          partnersBagsPerGame: refreshed.partnersGamesPlayed > 0 ? refreshed.partnersBags / refreshed.partnersGamesPlayed : 0,
          soloBagsPerGame: refreshed.soloGamesPlayed > 0 ? refreshed.soloBags / refreshed.soloGamesPlayed : 0,
        } as any;

        await prisma.userStats.update({
          where: { userId },
          data: totalsForBagsPerGame
        });
      }

      console.log(`[USER STATS] Updated stats for user ${userId} in game ${gameId}`);
    }

    console.log('[USER STATS] Successfully calculated stats for game:', gameId);
  } catch (error) {
    console.error('[USER STATS] Failed to calculate stats for game:', gameId, error);
  }
}

function determineIfWon(gamePlayer: any, gameResult: any, mode: string): number {
  
  try {
  if (mode === 'SOLO') {
    const seatIndex = gamePlayer.seatIndex;
    const winner = gameResult.winner;
    return winner === `SEAT_${seatIndex}` ? 1 : 0;
    }
    // Partners
    const teamIndex = gamePlayer.teamIndex;
    const winner = gameResult.winner;
    const expectedWinner = `TEAM${teamIndex}`;
    console.log(`[USER STATS] Checking win: teamIndex=${teamIndex}, expectedWinner=${expectedWinner}, actualWinner=${winner}`);
    return winner === expectedWinner ? 1 : 0;
  } catch (e) {
    console.warn('[USER STATS] determineIfWon failed, defaulting to 0:', e);
    return 0;
  }
}
