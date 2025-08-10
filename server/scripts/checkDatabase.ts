import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    console.log('🔍 Checking database state...\n');
    
    // Check all tables
    const userCount = await prisma.user.count();
    const userStatsCount = await prisma.userStats.count();
    const gameCount = await prisma.game.count();
    const gamePlayerCount = await prisma.gamePlayer.count();
    const gameResultCount = await prisma.gameResult.count();
    const roundCount = await prisma.round.count();
    const trickCount = await prisma.trick.count();
    const cardCount = await prisma.card.count();
    const friendCount = await prisma.friend.count();
    const blockedUserCount = await prisma.blockedUser.count();
    
    console.log('📊 Database Table Counts:');
    console.log('========================');
    console.log(`👤 Users: ${userCount}`);
    console.log(`📈 User Stats: ${userStatsCount}`);
    console.log(`🎮 Games: ${gameCount}`);
    console.log(`🎯 Game Players: ${gamePlayerCount}`);
    console.log(`🏆 Game Results: ${gameResultCount}`);
    console.log(`🔄 Rounds: ${roundCount}`);
    console.log(`🃏 Tricks: ${trickCount}`);
    console.log(`🂡 Cards: ${cardCount}`);
    console.log(`👥 Friends: ${friendCount}`);
    console.log(`🚫 Blocked Users: ${blockedUserCount}`);
    
    console.log('\n✅ Database check completed!');
    
    if (userCount === 0) {
      console.log('\n🎉 Database is clean - no users found!');
    } else {
      console.log(`\n⚠️  Found ${userCount} users still in database`);
    }
    
  } catch (error) {
    console.error('❌ Error checking database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase(); 