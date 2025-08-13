import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkGailCurrentDiscord() {
  try {
    console.log('🔍 Checking Gail\'s current Discord usage...\n');

    // Check which Discord ID Gail is currently using in the game
    const gailInGame = await prisma.user.findFirst({
      where: {
        username: { contains: 'gail', mode: 'insensitive' }
      },
      select: {
        id: true,
        username: true,
        email: true,
        discordId: true,
        createdAt: true
      }
    });

    if (!gailInGame) {
      console.log('❌ No Gail account found in database');
      return;
    }

    console.log('🎮 **Gail\'s Current Game Account:**');
    console.log(`   - Username: ${gailInGame.username}`);
    console.log(`   - Email: ${gailInGame.email}`);
    console.log(`   - Discord ID: ${gailInGame.discordId}`);
    console.log(`   - Created: ${gailInGame.createdAt}`);
    console.log('');

    // Check if this Discord ID matches what's in the Discord server
    console.log('📋 **Next Steps:**');
    console.log('1. Check which Discord ID Gail used to join the Discord server');
    console.log('2. Compare with the Discord ID above');
    console.log('3. If they don\'t match, we need to update the game account');
    console.log('');
    console.log('❓ **Question:** Which Discord ID did Gail use to join the Discord server?');

  } catch (error) {
    console.error('Error checking Gail\'s Discord usage:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkGailCurrentDiscord(); 