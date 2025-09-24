import { prismaNew } from "../newdb/client";
import { calculateAndStoreUserStats } from "../newdb/simple-statistics";

async function main() {
  console.log("[BACKFILL] Starting full UserStats rebuild...");

  // 1) Clear aggregates so we rebuild from scratch
  console.log("[BACKFILL] Clearing UserStats table...");
  await prismaNew.userStats.deleteMany({});

  // 2) Collect all completed games (those with a GameResult row)
  const gameResults = await prismaNew.gameResult.findMany({ select: { gameId: true } });
  const games = gameResults.map(gr => ({ id: gr.gameId }));
  console.log(`[BACKFILL] Found ${games.length} games to process`);

  let processed = 0;
  for (const g of games) {
    try {
      await calculateAndStoreUserStats(g.id);
    } catch (err) {
      console.error("[BACKFILL] Failed for game", g.id, err);
    }
    processed++;
    if (processed % 50 === 0) console.log(`[BACKFILL] Processed ${processed}/${games.length}`);
  }

  // 3) Recalculate bagsPerGame for all existing rows (defensive)
  console.log("[BACKFILL] Recomputing bagsPerGame columns across all users...");
  const users = await prismaNew.userStats.findMany({ select: { userId: true, totalGamesPlayed: true, totalBags: true, leagueGamesPlayed: true, leagueBags: true, partnersGamesPlayed: true, partnersBags: true, soloGamesPlayed: true, soloBags: true } });
  for (const u of users) {
    const totalBpg = u.totalGamesPlayed > 0 ? u.totalBags / u.totalGamesPlayed : 0;
    const leagueBpg = u.leagueGamesPlayed > 0 ? u.leagueBags / u.leagueGamesPlayed : 0;
    const partnersBpg = u.partnersGamesPlayed > 0 ? u.partnersBags / u.partnersGamesPlayed : 0;
    const soloBpg = u.soloGamesPlayed > 0 ? u.soloBags / u.soloGamesPlayed : 0;
    await prismaNew.userStats.update({
      where: { userId: u.userId },
      data: {
        totalBagsPerGame: totalBpg,
        leagueBagsPerGame: leagueBpg,
        partnersBagsPerGame: partnersBpg,
        soloBagsPerGame: soloBpg,
      }
    });
  }

  console.log("[BACKFILL] Completed.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
