import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function mergeGailAccounts() {
  try {
    console.log('🔍 Finding Gail\'s duplicate Discord accounts...\n');

    // Find Gail's accounts
    const gailAccounts = await prisma.user.findMany({
      where: {
        OR: [
          { email: 'gailvan@discord.local' },
          { email: 'gvanwag@hotmail.com' }
        ]
      },
      include: {
        stats: true
      },
      orderBy: {
        createdAt: 'asc' // Keep the oldest account as primary
      }
    });

    if (gailAccounts.length < 2) {
      console.log('❌ Need at least 2 accounts to merge');
      return;
    }

    console.log(`Found ${gailAccounts.length} accounts for Gail:\n`);

    gailAccounts.forEach((account, index) => {
      console.log(`Account ${index + 1}:`);
      console.log(`   - ID: ${account.id}`);
      console.log(`   - Username: ${account.username}`);
      console.log(`   - Email: ${account.email}`);
      console.log(`   - Discord ID: ${account.discordId || 'None'}`);
      console.log(`   - Created: ${account.createdAt}`);
      console.log(`   - Coins: ${account.coins}`);
      console.log(`   - Games Played: ${account.stats?.gamesPlayed || 0}`);
      console.log(`   - Games Won: ${account.stats?.gamesWon || 0}`);
      console.log('');
    });

    const primaryAccount = gailAccounts[0]; // Keep the oldest
    const secondaryAccount = gailAccounts[1]; // Merge this one

    console.log('🔄 Merging accounts...\n');
    console.log(`Primary (keeping): ${primaryAccount.username} (${primaryAccount.email})`);
    console.log(`Secondary (merging): ${secondaryAccount.username} (${secondaryAccount.email})`);

    // Merge stats
    const mergedStats = {
      gamesPlayed: (primaryAccount.stats?.gamesPlayed || 0) + (secondaryAccount.stats?.gamesPlayed || 0),
      gamesWon: (primaryAccount.stats?.gamesWon || 0) + (secondaryAccount.stats?.gamesWon || 0),
      totalCoinsWon: (primaryAccount.stats?.totalCoinsWon || 0) + (secondaryAccount.stats?.totalCoinsWon || 0),
      totalCoinsLost: (primaryAccount.stats?.totalCoinsLost || 0) + (secondaryAccount.stats?.totalCoinsLost || 0),
      netCoins: (primaryAccount.stats?.netCoins || 0) + (secondaryAccount.stats?.netCoins || 0)
    };

    // Merge coins
    const totalCoins = primaryAccount.coins + secondaryAccount.coins;

    console.log('\n📊 Merged Stats:');
    console.log(`   - Total Games: ${mergedStats.gamesPlayed}`);
    console.log(`   - Total Wins: ${mergedStats.gamesWon}`);
    console.log(`   - Total Coins: ${totalCoins}`);
    console.log(`   - Net Coins: ${mergedStats.netCoins}`);

    // Update primary account with merged data
    await prisma.user.update({
      where: { id: primaryAccount.id },
      data: {
        coins: totalCoins,
        stats: {
          upsert: {
            create: mergedStats,
            update: mergedStats
          }
        }
      }
    });

    // Delete the secondary account's stats first (if they exist)
    if (secondaryAccount.stats) {
      await prisma.userStats.delete({
        where: { userId: secondaryAccount.id }
      });
      console.log('🗑️ Deleted secondary account stats');
    }

    // Delete the secondary account
    await prisma.user.delete({
      where: { id: secondaryAccount.id }
    });

    console.log('\n✅ Successfully merged Gail\'s accounts!');
    console.log(`   - Kept account: ${primaryAccount.username} (${primaryAccount.email})`);
    console.log(`   - Deleted account: ${secondaryAccount.username} (${secondaryAccount.email})`);
    console.log('\n🎮 Gail should now be able to join games properly!');

  } catch (error) {
    console.error('Error merging Gail\'s accounts:', error);
  } finally {
    await prisma.$disconnect();
  }
}

mergeGailAccounts(); 