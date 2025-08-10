import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteAllUsers() {
  try {
    console.log('Starting comprehensive user data deletion...');
    
    // Delete in order to handle foreign key constraints
    
    // 1. Delete all game-related data first (depends on users)
    console.log('Deleting game-related data...');
    
    // Delete cards (depends on tricks)
    const cardsDeleted = await prisma.card.deleteMany({});
    console.log(`Deleted ${cardsDeleted.count} cards`);
    
    // Delete tricks (depends on rounds)
    const tricksDeleted = await prisma.trick.deleteMany({});
    console.log(`Deleted ${tricksDeleted.count} tricks`);
    
    // Delete rounds (depends on games)
    const roundsDeleted = await prisma.round.deleteMany({});
    console.log(`Deleted ${roundsDeleted.count} rounds`);
    
    // Delete game results (depends on games)
    const gameResultsDeleted = await prisma.gameResult.deleteMany({});
    console.log(`Deleted ${gameResultsDeleted.count} game results`);
    
    // Delete game players (depends on games and users)
    const gamePlayersDeleted = await prisma.gamePlayer.deleteMany({});
    console.log(`Deleted ${gamePlayersDeleted.count} game players`);
    
    // Delete games (depends on users)
    const gamesDeleted = await prisma.game.deleteMany({});
    console.log(`Deleted ${gamesDeleted.count} games`);
    
    // 2. Delete social relationships
    console.log('Deleting social relationships...');
    
    // Delete blocked users
    const blockedUsersDeleted = await prisma.blockedUser.deleteMany({});
    console.log(`Deleted ${blockedUsersDeleted.count} blocked user relationships`);
    
    // Delete friends
    const friendsDeleted = await prisma.friend.deleteMany({});
    console.log(`Deleted ${friendsDeleted.count} friend relationships`);
    
    // 3. Delete user stats
    console.log('Deleting user statistics...');
    const userStatsDeleted = await prisma.userStats.deleteMany({});
    console.log(`Deleted ${userStatsDeleted.count} user stats records`);
    
    // 4. Finally delete all users
    console.log('Deleting all users...');
    const usersDeleted = await prisma.user.deleteMany({});
    console.log(`Deleted ${usersDeleted.count} users`);
    
    console.log('✅ All user data has been successfully deleted from the database!');
    console.log('\nSummary:');
    console.log(`- ${usersDeleted.count} users deleted`);
    console.log(`- ${userStatsDeleted.count} user stats deleted`);
    console.log(`- ${friendsDeleted.count} friend relationships deleted`);
    console.log(`- ${blockedUsersDeleted.count} blocked user relationships deleted`);
    console.log(`- ${gamesDeleted.count} games deleted`);
    console.log(`- ${gamePlayersDeleted.count} game players deleted`);
    console.log(`- ${gameResultsDeleted.count} game results deleted`);
    console.log(`- ${roundsDeleted.count} rounds deleted`);
    console.log(`- ${tricksDeleted.count} tricks deleted`);
    console.log(`- ${cardsDeleted.count} cards deleted`);
    
  } catch (error) {
    console.error('❌ Error deleting user data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteAllUsers(); 