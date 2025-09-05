import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function completeReset() {
  try {
    console.log('🔄 Starting complete database reset...');
    console.log('⚠️  This will reset ALL user coins to 10,000,000 and clear ALL game data!');

    // Show counts before
    const countsBefore = await getCounts();
    console.log('\n�� Counts before reset:');
    console.log('========================');
    console.log(`👤 Users: ${countsBefore.users}`);
    console.log(`📈 User Stats: ${countsBefore.userStats}`);
    console.log(`🎮 Games: ${countsBefore.games}`);
    console.log(`🎯 Game Players: ${countsBefore.gamePlayers}`);
    console.log(`🏆 Game Results: ${countsBefore.gameResults}`);
    console.log(`🔄 Rounds: ${countsBefore.rounds}`);
    console.log(`🃏 Tricks: ${countsBefore.tricks}`);
    console.log(`🂡 Cards: ${countsBefore.cards}`);
    console.log(`👥 Friends: ${countsBefore.friends}`);
    console.log(`�� Blocked Users: ${countsBefore.blockedUsers}`);

    // Step 1: Clear all game-related data in correct order (respecting foreign keys)
    console.log('\n🗑️ Clearing game data...');
    
    // Clear in order to respect foreign key constraints
    await prisma.card.deleteMany();
    console.log('✅ Cleared all cards');
    
    await prisma.trick.deleteMany();
    console.log('✅ Cleared all tricks');
    
    // Clear RoundBid before Round
    await prisma.roundBid.deleteMany();
    console.log('✅ Cleared all round bids');
    
    await prisma.round.deleteMany();
    console.log('✅ Cleared all rounds');
    
    await prisma.gameResult.deleteMany();
    console.log('✅ Cleared all game results');
    
    await prisma.gamePlayer.deleteMany();
    console.log('✅ Cleared all game players');
    
    await prisma.game.deleteMany();
    console.log('✅ Cleared all games');

    // Step 2: Clear UserGameStats
    console.log('\n📊 Clearing user game stats...');
    await prisma.userGameStats.deleteMany();
    console.log('✅ Cleared all user game stats');

    // Step 3: Reset user stats to 0
    console.log('\n📊 Resetting user stats to 0...');
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

    // Step 4: Set all player coins to 10 million
    console.log('\n💰 Setting all player coins to 10,000,000...');
    await prisma.user.updateMany({
      data: {
        coins: 10_000_000
      }
    });
    console.log('✅ Set all player coins to 10,000,000');

    // Show counts after
    const countsAfter = await getCounts();
    console.log('\n📊 Counts after reset:');
    console.log('=======================');
    console.log(`👤 Users: ${countsAfter.users}`);
    console.log(`📈 User Stats: ${countsAfter.userStats}`);
    console.log(`🎮 Games: ${countsAfter.games}`);
    console.log(`🎯 Game Players: ${countsAfter.gamePlayers}`);
    console.log(`🏆 Game Results: ${countsAfter.gameResults}`);
    console.log(`🔄 Rounds: ${countsAfter.rounds}`);
    console.log(`🃏 Tricks: ${countsAfter.tricks}`);
    console.log(`�� Cards: ${countsAfter.cards}`);
    console.log(`👥 Friends: ${countsAfter.friends}`);
    console.log(`🚫 Blocked Users: ${countsAfter.blockedUsers}`);

    console.log('\n🎉 Complete database reset successful!');
    console.log('✅ All game data cleared');
    console.log('✅ All user stats reset to 0');
    console.log('✅ All user coins set to 10,000,000');
    console.log('✅ Users, friends, and blocked users preserved');

  } catch (error) {
    console.error('❌ Error during complete reset:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function getCounts() {
  return {
    users: await prisma.user.count(),
    userStats: await prisma.userStats.count(),
    games: await prisma.game.count(),
    gamePlayers: await prisma.gamePlayer.count(),
    gameResults: await prisma.gameResult.count(),
    rounds: await prisma.round.count(),
    tricks: await prisma.trick.count(),
    cards: await prisma.card.count(),
    friends: await prisma.friend.count(),
    blockedUsers: await prisma.blockedUser.count()
  };
}

// Run the reset
completeReset()
  .then(() => {
    console.log('\n✅ Complete reset finished successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Complete reset failed:', error);
    process.exit(1);
  });
