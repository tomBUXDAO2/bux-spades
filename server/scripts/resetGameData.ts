import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetGameData() {
  try {
    console.log('🔄 Starting game data reset...');

    // 1. Clear all game-related data in correct order (respecting foreign keys)
    console.log('🗑️ Clearing game data...');
    
    // Clear in order to respect foreign key constraints
    await prisma.card.deleteMany();
    console.log('✅ Cleared all cards');
    
    await prisma.trick.deleteMany();
    console.log('✅ Cleared all tricks');
    
    await prisma.round.deleteMany();
    console.log('✅ Cleared all rounds');
    
    await prisma.gameResult.deleteMany();
    console.log('✅ Cleared all game results');
    
    await prisma.gamePlayer.deleteMany();
    console.log('✅ Cleared all game players');
    
    await prisma.game.deleteMany();
    console.log('✅ Cleared all games');

    // 2. Reset user stats to 0
    console.log('📊 Resetting user stats...');
    await prisma.userStats.updateMany({
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
        netCoins: 0
      }
    });
    console.log('✅ Reset all user stats to 0');

    // 3. Clear UserGameStats
    console.log('📊 Clearing user game stats...');
    await prisma.userGameStats.deleteMany();
    console.log('✅ Cleared all user game stats');

    // 4. Set all player coins to 5 million
    console.log('💰 Setting all player coins to 5,000,000...');
    await prisma.user.updateMany({
      data: {
        coins: 5000000
      }
    });
    console.log('✅ Set all player coins to 5,000,000');

    // 5. Verify the reset
    const userCount = await prisma.user.count();
    const gameCount = await prisma.game.count();
    const gamePlayerCount = await prisma.gamePlayer.count();
    const gameResultCount = await prisma.gameResult.count();
    const roundCount = await prisma.round.count();
    const trickCount = await prisma.trick.count();
    const cardCount = await prisma.card.count();
    const userStatsCount = await prisma.userStats.count();
    const userGameStatsCount = await prisma.userGameStats.count();

    console.log('\n📋 Reset Summary:');
    console.log(`👥 Users: ${userCount} (preserved)`);
    console.log(`🎮 Games: ${gameCount} (cleared)`);
    console.log(`👤 Game Players: ${gamePlayerCount} (cleared)`);
    console.log(`🏆 Game Results: ${gameResultCount} (cleared)`);
    console.log(`🔄 Rounds: ${roundCount} (cleared)`);
    console.log(`🃏 Tricks: ${trickCount} (cleared)`);
    console.log(`🃏 Cards: ${cardCount} (cleared)`);
    console.log(`📊 User Stats: ${userStatsCount} (reset to 0)`);
    console.log(`📊 User Game Stats: ${userGameStatsCount} (cleared)`);

    // Check a few users to verify coins and stats
    const sampleUsers = await prisma.user.findMany({
      take: 5,
      include: {
        UserStats: true
      }
    });

    console.log('\n✅ Sample user verification:');
    sampleUsers.forEach(user => {
      console.log(`- ${user.username}: ${user.coins.toLocaleString()} coins, ${user.UserStats?.gamesPlayed || 0} games played`);
    });

    console.log('\n🎉 Game data reset completed successfully!');
    console.log('✅ All game data cleared');
    console.log('✅ All player coins set to 5,000,000');
    console.log('✅ All user stats reset to 0');
    console.log('✅ User accounts, friends, and blocked lists preserved');

  } catch (error) {
    console.error('❌ Error during game data reset:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the reset
resetGameData()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }); 