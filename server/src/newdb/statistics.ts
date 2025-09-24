import { prismaNew } from './client';

export async function calculateAndStoreUserStats(gameId: string): Promise<void> {
  console.log('[USER STATS] Calculating stats for game:', gameId);
  
  try {
    // Get game details
    const game = await prismaNew.game.findUnique({
      where: { id: gameId }
    });

    if (!game) {
      console.error('[USER STATS] Game not found:', gameId);
      return;
    }

    // Get game players
    const gamePlayers = await prismaNew.gamePlayer.findMany({
      where: { gameId }
    });

    // Get all rounds and their stats
    const rounds = await prismaNew.round.findMany({
      where: { gameId }
    });

    // Get player round stats for all rounds
    const playerRoundStats = await prismaNew.playerRoundStats.findMany({
      where: { 
        roundId: { in: rounds.map(r => r.id) }
      }
    });

    // Get game result
    const gameResult = await prismaNew.gameResult.findUnique({
      where: { gameId }
    });

    if (!gameResult) {
      console.error('[USER STATS] Game result not found for game:', gameId);
      return;
    }

    // Calculate stats for each human player
    for (const gamePlayer of gamePlayers) {
      if (!gamePlayer.isHuman) continue;

      const userId = gamePlayer.userId;
      const isLeague = game.isLeague;
      const mode = game.mode === 'PARTNERS' ? 'PARTNERS' : 'SOLO';
      const format = game.format;
      // Only set gimmick if format is GIMMICK, otherwise null
      const gimmick = game.format === 'GIMMICK' ? (game.gimmickVariant || 'ALL') : null;

      // Get all rounds for this player
      const playerRounds = playerRoundStats.filter(prs => prs.userId === userId);

      // Calculate stats
      const gamesPlayed = 1;
      const gamesWon = determineIfWon(gamePlayer, gameResult, game.mode);
      const winPct = gamesWon / gamesPlayed;
      
      const totalBags = playerRounds.reduce((sum, prs) => sum + prs.bagsThisRound, 0);
      const bagsPerGame = totalBags / gamesPlayed;
      
      const nilsBid = playerRounds.filter(prs => prs.bid === 0).length;
      const nilsMade = playerRounds.filter(prs => prs.bid === 0 && prs.madeNil).length;
      const nilPct = nilsBid > 0 ? nilsMade / nilsBid : 0;
      
      const blindNilsBid = playerRounds.filter(prs => prs.bid === -1).length;
      const blindNilsMade = playerRounds.filter(prs => prs.bid === -1 && prs.madeBlindNil).length;
      const blindNilPct = blindNilsBid > 0 ? blindNilsMade / blindNilsBid : 0;

      console.log(`[USER STATS] Processing user ${userId}: gamesPlayed=${gamesPlayed}, gamesWon=${gamesWon}, totalBags=${totalBags}, gimmick=${gimmick}`);

      // For non-gimmick games, use a simple create approach
      if (gimmick === null) {
        await prismaNew.userStatsBreakdown.create({
          data: {
            userId,
            isLeague,
            mode: mode as any,
            format: format as any,
            gimmick: null,
            gamesPlayed,
            gamesWon,
            winPct,
            totalBags,
            bagsPerGame,
            nilsBid,
            nilsMade,
            nilPct,
            blindNilsBid,
            blindNilsMade,
            blindNilPct
          }
        });
      } else {
        // For gimmick games, use upsert
        await prismaNew.userStatsBreakdown.upsert({
          where: {
            userId_isLeague_mode_format_gimmick: {
              userId,
              isLeague,
              mode: mode as any,
              format: format as any,
              gimmick: gimmick as any
            }
          },
          update: {
            gamesPlayed: { increment: gamesPlayed },
            gamesWon: { increment: gamesWon },
            winPct: 0, // Will be recalculated
            totalBags: { increment: totalBags },
            bagsPerGame: 0, // Will be recalculated
            nilsBid: { increment: nilsBid },
            nilsMade: { increment: nilsMade },
            nilPct: 0, // Will be recalculated
            blindNilsBid: { increment: blindNilsBid },
            blindNilsMade: { increment: blindNilsMade },
            blindNilPct: 0 // Will be recalculated
          },
          create: {
            userId,
            isLeague,
            mode: mode as any,
            format: format as any,
            gimmick: gimmick as any,
            gamesPlayed,
            gamesWon,
            winPct,
            totalBags,
            bagsPerGame,
            nilsBid,
            nilsMade,
            nilPct,
            blindNilsBid,
            blindNilsMade,
            blindNilPct
          }
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
  if (gameMode === 'SOLO') {
    // For solo games, check if this player's seat won
    const seatIndex = gamePlayer.seatIndex;
    const winner = gameResult.winner;
    return winner === `SEAT_${seatIndex}` ? 1 : 0;
  } else {
    // For partners games, check if this player's team won
    const teamIndex = gamePlayer.teamIndex;
    const winner = gameResult.winner;
    // Winner is stored as TEAM0 or TEAM1, but teamIndex is 0 or 1
    // So if teamIndex is 0 and winner is TEAM0, they won
    // If teamIndex is 1 and winner is TEAM1, they won
    const expectedWinner = `TEAM${teamIndex}`;
    console.log(`[USER STATS] Checking win: teamIndex=${teamIndex}, expectedWinner=${expectedWinner}, actualWinner=${winner}`);
    return winner === expectedWinner ? 1 : 0;
  }
}
