import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteAllUsers() {
  try {
    console.log('Starting deletion process...');

    // Delete all related records first
    console.log('Deleting user stats...');
    await prisma.userStats.deleteMany();
    
    console.log('Deleting game players...');
    await prisma.gamePlayer.deleteMany();
    
    console.log('Deleting games...');
    await prisma.game.deleteMany();
    
    console.log('Deleting friends...');
    await prisma.friend.deleteMany();
    
    console.log('Deleting blocked users...');
    await prisma.blockedUser.deleteMany();

    // Finally, delete all users
    console.log('Deleting users...');
    const deletedUsers = await prisma.user.deleteMany();
    
    console.log(`Successfully deleted ${deletedUsers.count} users and all related records`);
  } catch (error) {
    console.error('Error deleting users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteAllUsers(); 