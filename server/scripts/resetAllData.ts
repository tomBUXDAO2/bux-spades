import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetAllData() {
  try {
    console.log('🧹 Starting complete data reset...');
    
    // 1. Delete all game-related data
    console.log('\n🗑️  Deleting game data...');
    
    // Delete in correct order due to foreign key constraints
    console.log('  Deleting cards...');
    await prisma.card.deleteMany({});
    
    console.log('  Deleting tricks...');
    await prisma.trick.deleteMany({});
    
    console.log('  Deleting round bids...');
    await prisma.roundBid.deleteMany({});
    
    console.log('  Deleting rounds...');
    await prisma.round.deleteMany({});
    
    console.log('  Deleting game results...');
    await prisma.gameResult.deleteMany({});
    
    console.log('  Deleting game players...');
    await prisma.gamePlayer.deleteMany({});
    
    console.log('  Deleting games...');
    await prisma.game.deleteMany({});
    
    // 2. Reset all user coins to 5 million
    console.log('\n💰 Resetting all user coins to 5,000,000...');
    const users = await prisma.user.findMany();
    console.log(`  Found ${users.length} users to reset`);
    
    for (const user of users) {
      await prisma.user.update({
        where: { id: user.id },
        data: { coins: 5000000 }
      });
      console.log(`    ✅ ${user.username}: Reset to 5,000,000 coins`);
    }
    
    // 3. Reset all user stats to 0
    console.log('\n📊 Resetting all user statistics to 0...');
    const userStats = await prisma.userStats.findMany();
    console.log(`  Found ${userStats.length} user stats to reset`);
    
    for (const stats of userStats) {
      await prisma.userStats.update({
        where: { id: stats.id },
        data: {
          gamesPlayed: 0,
          gamesWon: 0,
          nilsBid: 0,
          nilsMade: 0,
          blindNilsBid: 0,
          blindNilsMade: 0,
          totalBags: 0,
          bagsPerGame: 0,
          partnersGamesPlayed: 0,
          partnersGamesWon: 0,
          partnersTotalBags: 0,
          partnersBagsPerGame: 0,
          soloGamesPlayed: 0,
          soloGamesWon: 0,
          soloTotalBags: 0,
          soloBagsPerGame: 0,
          totalCoinsWon: 0,
          totalCoinsLost: 0,
          netCoins: 0,
          totalTricksBid: 0,
          totalTricksMade: 0,
          totalNilBids: 0,
          totalBlindNilBids: 0,
          updatedAt: new Date()
        }
      });
      
      // Get username for logging
      const user = await prisma.user.findUnique({ where: { id: stats.userId } });
      console.log(`    ✅ ${user?.username || stats.userId}: All stats reset to 0`);
    }
    
    // 4. Reset user game stats
    console.log('\n🎮 Resetting user game stats...');
    const userGameStats = await prisma.userGameStats.findMany();
    console.log(`  Found ${userGameStats.length} user game stats to reset`);
    
    for (const gameStats of userGameStats) {
      await prisma.userGameStats.update({
        where: { id: gameStats.id },
        data: {
          gamesPlayed: 0,
          gamesWon: 0,
          nilsBid: 0,
          nilsMade: 0,
          blindNilsBid: 0,
          blindNilsMade: 0
        }
      });
    }
    console.log(`    ✅ Reset ${userGameStats.length} user game stats`);
    
    // 5. Verify the reset
    console.log('\n🔍 Verifying reset results...');
    
    const gameCount = await prisma.game.count();
    const roundCount = await prisma.round.count();
    const trickCount = await prisma.trick.count();
    const cardCount = await prisma.card.count();
    const gamePlayerCount = await prisma.gamePlayer.count();
    const gameResultCount = await prisma.gameResult.count();
    
    console.log('📊 Database counts after reset:');
    console.log(`  Games: ${gameCount}`);
    console.log(`  Rounds: ${roundCount}`);
    console.log(`  Tricks: ${trickCount}`);
    console.log(`  Cards: ${cardCount}`);
    console.log(`  Game Players: ${gamePlayerCount}`);
    console.log(`  Game Results: ${gameResultCount}`);
    
    // Check a few user coin balances
    const sampleUsers = await prisma.user.findMany({ take: 5 });
    console.log('\n💰 Sample user coin balances:');
    for (const user of sampleUsers) {
      console.log(`  ${user.username}: ${user.coins.toLocaleString()} coins`);
    }
    
    // Check a few user stats
    const sampleStats = await prisma.userStats.findMany({ take: 5 });
    console.log('\n📊 Sample user stats:');
    for (const stats of sampleStats) {
      const user = await prisma.user.findUnique({ where: { id: stats.userId } });
      console.log(`  ${user?.username || stats.userId}: ${stats.gamesPlayed} games, ${stats.totalBags} bags`);
    }
    
    console.log('\n✅ Complete data reset successful!');
    console.log('🎯 Ready for clean testing!');
    
  } catch (error) {
    console.error('❌ Error during data reset:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
resetAllData(); 