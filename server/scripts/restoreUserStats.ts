import { prisma } from '../src/lib/prisma';

async function restoreUserStats() {
  try {
    console.log('Starting to restore UserStats records for all users...');

    // Get all users
    const users = await prisma.user.findMany({
      select: { id: true, username: true }
    });

    console.log(`Found ${users.length} users to restore stats for`);

    let createdCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      // Check if UserStats already exists for this user
      const existingStats = await prisma.userStats.findUnique({
        where: { userId: user.id }
      });

      if (existingStats) {
        console.log(`UserStats already exists for ${user.username}, skipping`);
        skippedCount++;
        continue;
      }

      // Create UserStats record with 0 values
      await prisma.userStats.create({
        data: {
          id: `stats_${user.id}_${Date.now()}`,
          userId: user.id,
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
          netCoins: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      console.log(`Created UserStats for ${user.username} with 0 values`);
      createdCount++;
    }

    // Verify the results
    const totalUserStats = await prisma.userStats.count();
    const totalUsers = await prisma.user.count();

    console.log('\n=== USER STATS RESTORATION SUMMARY ===');
    console.log(`Users in database: ${totalUsers}`);
    console.log(`UserStats records: ${totalUserStats}`);
    console.log(`New UserStats created: ${createdCount}`);
    console.log(`UserStats skipped (already existed): ${skippedCount}`);

    if (totalUserStats === totalUsers) {
      console.log('\n✅ SUCCESS: All users now have UserStats records with 0 values!');
    } else {
      console.log('\n❌ WARNING: Some users may still be missing UserStats records');
      console.log(`Missing: ${totalUsers - totalUserStats} users`);
    }

  } catch (error) {
    console.error('Error restoring user stats:', error);
  } finally {
    await prisma.$disconnect();
  }
}

restoreUserStats(); 