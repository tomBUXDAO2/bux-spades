import { DetailedStatsService } from './src/services/DetailedStatsService.js';
import { prisma } from './src/config/database.js';

async function testStats() {
  try {
    console.log('Testing stats function...');
    
    // Find your user by Discord ID
    const user = await prisma.user.findUnique({
      where: { discordId: '931160720261939230' } // Your Discord ID
    });

    if (!user) {
      console.log('❌ User not found in database');
      return;
    }

    console.log(`✅ Found user: ${user.username} (${user.id})`);

    // Test the stats service
    const stats = await DetailedStatsService.getUserStats(user.id, {
      mode: 'ALL',
      format: 'ALL',
      isLeague: true  // Only league games
    });

    console.log('✅ Stats retrieved successfully:');
    console.log(`   Total games: ${stats.totalGames}`);
    console.log(`   Games won: ${stats.gamesWon}`);
    console.log(`   Win rate: ${stats.winRate.toFixed(1)}%`);
    console.log(`   Total bags: ${stats.bags.total}`);
    console.log(`   Bags per game: ${stats.bags.perGame.toFixed(1)}`);

    if (stats.modeBreakdown) {
      const partners = stats.modeBreakdown.partners || { played: 0, won: 0, winRate: 0 };
      const solo = stats.modeBreakdown.solo || { played: 0, won: 0, winRate: 0 };
      
      console.log('   Partners:', partners);
      console.log('   Solo:', solo);
    }

  } catch (error) {
    console.error('❌ Error testing stats:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testStats();
