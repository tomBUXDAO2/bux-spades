import { StatsService } from '../src/services/StatsService.js';
import { prisma } from '../src/config/database.js';

async function main() {
  try {
    console.log('[REBUILD USER STATS] Starting full rebuild...');
    await StatsService.rebuildAllUserStats();
    console.log('[REBUILD USER STATS] Rebuild completed successfully');
  } catch (error) {
    console.error('[REBUILD USER STATS] Error during rebuild:', error);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main();

