import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetAllStats() {
  try {
    console.log('Starting stats reset...');
    
    // Reset all user stats to 0 (only existing fields)
    const result = await prisma.userStats.updateMany({
      data: {
        gamesPlayed: 0,
        gamesWon: 0,
        nilsBid: 0,
        nilsMade: 0,
        blindNilsBid: 0,
        blindNilsMade: 0
      }
    });
    
    console.log(`Successfully reset stats for ${result.count} users`);
    
    // Also reset coins to default value (5,000,000)
    const coinsResult = await prisma.user.updateMany({
      data: {
        coins: 5000000
      }
    });
    
    console.log(`Successfully reset coins for ${coinsResult.count} users`);
    
    console.log('Stats reset completed successfully!');
  } catch (error) {
    console.error('Error resetting stats:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetAllStats(); 