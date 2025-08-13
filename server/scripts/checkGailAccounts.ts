import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkGailAccounts() {
  try {
    console.log('🔍 Checking Gail\'s accounts...\n');

    // Find Gail's accounts
    const gailAccounts = await prisma.user.findMany({
      where: {
        OR: [
          { email: 'gailvan@discord.local' },
          { email: 'gvanwag@hotmail.com' },
          { username: { contains: 'gail', mode: 'insensitive' } }
        ]
      },
      include: {
        stats: true
      }
    });

    console.log(`Found ${gailAccounts.length} accounts for Gail:\n`);

    gailAccounts.forEach(account => {
      console.log(`👤 **${account.username}**`);
      console.log(`   - ID: ${account.id}`);
      console.log(`   - Email: ${account.email}`);
      console.log(`   - Discord ID: ${account.discordId || 'None'}`);
      console.log(`   - Created: ${account.createdAt}`);
      console.log(`   - Games Played: ${account.stats?.gamesPlayed || 0}`);
      console.log(`   - Games Won: ${account.stats?.gamesWon || 0}`);
      console.log(`   - Coins: ${account.coins}`);
      console.log('');
    });

    if (gailAccounts.length > 1) {
      console.log('❌ Multiple accounts found - this is causing the game redirection issue!');
      console.log('The system doesn\'t know which account to use for Gail.');
    }

  } catch (error) {
    console.error('Error checking Gail\'s accounts:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkGailAccounts(); 