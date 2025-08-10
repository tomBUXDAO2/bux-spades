import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetAllStats() {
  try {
    console.log('Starting comprehensive stats reset...');
    
    // Reset all user stats to 0 (including new fields)
    const result = await prisma.userStats.updateMany({
      data: {
        gamesPlayed: 0,
        gamesWon: 0,
        nilsBid: 0,
        nilsMade: 0,
        blindNilsBid: 0,
        blindNilsMade: 0,
        totalBags: 0,
        bagsPerGame: 0,
        // New fields for separate tracking
        partnersGamesPlayed: 0,
        partnersGamesWon: 0,
        partnersTotalBags: 0,
        partnersBagsPerGame: 0,
        soloGamesPlayed: 0,
        soloGamesWon: 0,
        soloTotalBags: 0,
        soloBagsPerGame: 0,
        // Coin tracking fields
        totalCoinsWon: 0,
        totalCoinsLost: 0,
        netCoins: 0
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
    
    console.log('Comprehensive stats reset completed successfully!');
  } catch (error) {
    console.error('Error resetting stats:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetAllStats(); 