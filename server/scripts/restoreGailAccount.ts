import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function restoreGailAccount() {
  try {
    console.log('🔧 Restoring Gail\'s account with correct Discord ID...\n');

    // Create Gail's account with the correct Discord ID
    const gailAccount = await prisma.user.create({
      data: {
        username: 'gailvan',
        email: 'gailvan@discord.local',
        discordId: '1404189198675738715',
        coins: 5000000, // Default starting coins
        avatar: null
      }
    });

    // Create user stats
    await prisma.userStats.create({
      data: {
        userId: gailAccount.id
      }
    });

    console.log('✅ Successfully restored Gail\'s account!');
    console.log(`   - Username: ${gailAccount.username}`);
    console.log(`   - Email: ${gailAccount.email}`);
    console.log(`   - Discord ID: ${gailAccount.discordId}`);
    console.log(`   - User ID: ${gailAccount.id}`);
    console.log(`   - Coins: ${gailAccount.coins}`);
    console.log('');
    console.log('🎮 Gail should now be able to join games properly!');

  } catch (error) {
    console.error('Error restoring Gail\'s account:', error);
  } finally {
    await prisma.$disconnect();
  }
}

restoreGailAccount(); 