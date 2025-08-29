import { prisma } from '../src/lib/prisma';

async function clearUserStats() {
  try {
    console.log('Starting to clear all user statistics...');
    
    // Delete UserGameStats first (they reference User)
    console.log('Deleting UserGameStats records...');
    const userGameStatsDeleted = await prisma.userGameStats.deleteMany({});
    console.log(`Deleted ${userGameStatsDeleted.count} UserGameStats records`);
    
    // Delete UserStats
    console.log('Deleting UserStats records...');
    const userStatsDeleted = await prisma.userStats.deleteMany({});
    console.log(`Deleted ${userStatsDeleted.count} UserStats records`);
    
    // Verify what's left
    console.log('\nVerifying remaining data...');
    
    const remainingUserStats = await prisma.userStats.count();
    const remainingUserGameStats = await prisma.userGameStats.count();
    const remainingUsers = await prisma.user.count();
    
    console.log('\n=== USER STATS CLEARANCE SUMMARY ===');
    console.log('User stats cleared:');
    console.log(`- UserStats: ${remainingUserStats} (should be 0)`);
    console.log(`- UserGameStats: ${remainingUserGameStats} (should be 0)`);
    
    console.log('\nUser data preserved:');
    console.log(`- Users: ${remainingUsers} (preserved)`);
    
    if (remainingUserStats === 0 && remainingUserGameStats === 0) {
      console.log('\n✅ SUCCESS: All user statistics cleared successfully!');
    } else {
      console.log('\n❌ WARNING: Some user stats may still remain');
    }
    
  } catch (error) {
    console.error('Error clearing user stats:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearUserStats(); 