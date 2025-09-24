import { prismaNew } from './client';

export async function calculateAndStoreUserStats(gameId: string): Promise<void> {
  
  try {
    // Load game data
    const game = await prismaNew.game.findUnique({
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
    const gamePlayers = await prismaNew.gamePlayer.findMany({
      where: { gameId },
      select: { userId: true, seatIndex: true, teamIndex: true, isHuman: true }
    });

    // Load round IDs for this game
    const rounds = await prismaNew.round.findMany({
      where: { gameId },
      select: { id: true }
    });
    const roundIds = rounds.map(r => r.id);

    // Load round stats used to compute per-player totals
    const playerRoundStats = roundIds.length > 0 ? await prismaNew.playerRoundStats.findMany({
      where: { roundId: { in: roundIds } as any },
      select: { roundId: true, userId: true, seatIndex: true, teamIndex: true, bid: true, tricksWon: true, bagsThisRound: true, madeNil: true, madeBlindNil: true }
    }) : [];

    // Load final game result for winner
    const gameResult = await prismaNew.gameResult.findUnique({ where: { gameId } });
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
      const gamesPlayed = 1;
      const gamesWon = determineIfWon(gamePlayer, gameResult, game.mode);
      const totalBags = playerRounds.reduce((sum, prs) => sum + prs.bagsThisRound, 0);
      const nilsBid = playerRounds.filter(prs => prs.bid === 0).length;
      const nilsMade = playerRounds.filter(prs => prs.bid === 0 && prs.madeNil).length;
      const blindNilsBid = playerRounds.filter(prs => prs.bid === -1).length;
      const blindNilsMade = playerRounds.filter(prs => prs.bid === -1 && prs.madeBlindNil).length;

      console.log(`[USER STATS] Processing user ${userId}: gamesPlayed=${gamesPlayed}, gamesWon=${gamesWon}, totalBags=${totalBags}`);

      // Get or create user stats record
      let userStats = await prismaNew.userStats.findUnique({ where: { userId } });
      if (!userStats) {
        userStats = await prismaNew.userStats.create({ data: { userId } });
      }

      // Update all relevant fields
      const updateData: any = {
        totalGamesPlayed: { increment: gamesPlayed },
        totalGamesWon: { increment: gamesWon },
        totalBags: { increment: totalBags },
        totalNilsBid: { increment: nilsBid },
        totalNilsMade: { increment: nilsMade },
        totalBlindNilsBid: { increment: blindNilsBid },
        totalBlindNilsMade: { increment: blindNilsMade }
      };

      // Add league-specific updates
      if (isLeague) {
        updateData.leagueGamesPlayed = { increment: gamesPlayed };
        updateData.leagueGamesWon = { increment: gamesWon };
        updateData.leagueBags = { increment: totalBags };
        updateData.leagueNilsBid = { increment: nilsBid };
        updateData.leagueNilsMade = { increment: nilsMade };
        updateData.leagueBlindNilsBid = { increment: blindNilsBid };
        updateData.leagueBlindNilsMade = { increment: blindNilsMade };
      }

      // Add mode-specific bags counters
      if (mode === 'PARTNERS') {
        updateData.partnersGamesPlayed = { increment: gamesPlayed };
        updateData.partnersGamesWon = { increment: gamesWon };
        updateData.partnersBags = { increment: totalBags };
        updateData.partnersNilsBid = { increment: nilsBid };
        updateData.partnersNilsMade = { increment: nilsMade };
        updateData.partnersBlindNilsBid = { increment: blindNilsBid };
        updateData.partnersBlindNilsMade = { increment: blindNilsMade };
      } else if (mode === 'SOLO') {
        updateData.soloGamesPlayed = { increment: gamesPlayed };
        updateData.soloGamesWon = { increment: gamesWon };
        updateData.soloBags = { increment: totalBags };
        updateData.soloNilsBid = { increment: nilsBid };
        updateData.soloNilsMade = { increment: nilsMade };
        updateData.soloBlindNilsBid = { increment: blindNilsBid };
        updateData.soloBlindNilsMade = { increment: blindNilsMade };
      }

      // Add format-specific updates
      if (format === 'REGULAR') {
        updateData.totalRegularPlayed = { increment: gamesPlayed };
        updateData.totalRegularWon = { increment: gamesWon };
        if (isLeague) {
          updateData.leagueRegularPlayed = { increment: gamesPlayed };
          updateData.leagueRegularWon = { increment: gamesWon };
        }
        if (mode === 'PARTNERS') {
          updateData.partnersRegularPlayed = { increment: gamesPlayed };
          updateData.partnersRegularWon = { increment: gamesWon };
        } else if (mode === 'SOLO') {
          updateData.soloRegularPlayed = { increment: gamesPlayed };
          updateData.soloRegularWon = { increment: gamesWon };
        }
      } else if (format === 'WHIZ') {
        updateData.totalWhizPlayed = { increment: gamesPlayed };
        updateData.totalWhizWon = { increment: gamesWon };
        if (isLeague) {
          updateData.leagueWhizPlayed = { increment: gamesPlayed };
          updateData.leagueWhizWon = { increment: gamesWon };
        }
        if (mode === 'PARTNERS') {
          updateData.partnersWhizPlayed = { increment: gamesPlayed };
          updateData.partnersWhizWon = { increment: gamesWon };
        } else if (mode === 'SOLO') {
          updateData.soloWhizPlayed = { increment: gamesPlayed };
          updateData.soloWhizWon = { increment: gamesWon };
        }
      } else if (format === 'MIRROR') {
        updateData.totalMirrorPlayed = { increment: gamesPlayed };
        updateData.totalMirrorWon = { increment: gamesWon };
        if (isLeague) {
          updateData.leagueMirrorPlayed = { increment: gamesPlayed };
          updateData.leagueMirrorWon = { increment: gamesWon };
        }
        if (mode === 'PARTNERS') {
          updateData.partnersMirrorPlayed = { increment: gamesPlayed };
          updateData.partnersMirrorWon = { increment: gamesWon };
        } else if (mode === 'SOLO') {
          updateData.soloMirrorPlayed = { increment: gamesPlayed };
          updateData.soloMirrorWon = { increment: gamesWon };
        }
      } else if (format === 'GIMMICK') {
        updateData.totalGimmickPlayed = { increment: gamesPlayed };
        updateData.totalGimmickWon = { increment: gamesWon };
        if (isLeague) {
          updateData.leagueGimmickPlayed = { increment: gamesPlayed };
          updateData.leagueGimmickWon = { increment: gamesWon };
        }
        if (mode === 'PARTNERS') {
          updateData.partnersGimmickPlayed = { increment: gamesPlayed };
          updateData.partnersGimmickWon = { increment: gamesWon };
        } else if (mode === 'SOLO') {
          updateData.soloGimmickPlayed = { increment: gamesPlayed };
          updateData.soloGimmickWon = { increment: gamesWon };
        }
      }

      // Special rules: Screamer / Assassin
      if (hasScreamer) {
        updateData.totalScreamerPlayed = { increment: gamesPlayed };
        updateData.totalScreamerWon = { increment: gamesWon };
        if (isLeague) {
          updateData.leagueScreamerPlayed = { increment: gamesPlayed };
          updateData.leagueScreamerWon = { increment: gamesWon };
        }
        if (mode === 'PARTNERS') {
          updateData.partnersScreamerPlayed = { increment: gamesPlayed };
          updateData.partnersScreamerWon = { increment: gamesWon };
        } else if (mode === 'SOLO') {
          updateData.soloScreamerPlayed = { increment: gamesPlayed };
          updateData.soloScreamerWon = { increment: gamesWon };
        }
      }

      if (hasAssassin) {
        updateData.totalAssassinPlayed = { increment: gamesPlayed };
        updateData.totalAssassinWon = { increment: gamesWon };
        if (isLeague) {
          updateData.leagueAssassinPlayed = { increment: gamesPlayed };
          updateData.leagueAssassinWon = { increment: gamesWon };
        }
        if (mode === 'PARTNERS') {
          updateData.partnersAssassinPlayed = { increment: gamesPlayed };
          updateData.partnersAssassinWon = { increment: gamesWon };
        } else if (mode === 'SOLO') {
          updateData.soloAssassinPlayed = { increment: gamesPlayed };
          updateData.soloAssassinWon = { increment: gamesWon };
        }
      }

      // Update the user stats (counters)
      await prismaNew.userStats.update({
        where: { userId },
        data: updateData
      });

      // Recalculate and persist bags-per-game fields based on current totals
      const refreshed = await prismaNew.userStats.findUnique({ where: { userId } });
      if (refreshed) {
        const totalsForBagsPerGame = {
          totalBagsPerGame: refreshed.totalGamesPlayed > 0 ? refreshed.totalBags / refreshed.totalGamesPlayed : 0,
          leagueBagsPerGame: refreshed.leagueGamesPlayed > 0 ? refreshed.leagueBags / refreshed.leagueGamesPlayed : 0,
          partnersBagsPerGame: refreshed.partnersGamesPlayed > 0 ? refreshed.partnersBags / refreshed.partnersGamesPlayed : 0,
          soloBagsPerGame: refreshed.soloGamesPlayed > 0 ? refreshed.soloBags / refreshed.soloGamesPlayed : 0,
        } as any;

        await prismaNew.userStats.update({
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

function determineIfWon(gamePlayer: any, gameResult: any, gameMode: string): number {
  
  try {
    if (gameMode === 'SOLO') {
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
