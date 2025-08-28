import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixMissingUserStats() {
  try {
    console.log('Finding users without UserStats...');
    
    // Find all users without UserStats
    const usersWithoutStats = await prisma.$queryRaw<any[]>`
      SELECT u.id, u.username 
      FROM "User" u 
      LEFT JOIN "UserStats" us ON u.id = us."userId" 
      WHERE us."userId" IS NULL
    `;
    
    console.log(`Found ${usersWithoutStats.length} users without UserStats`);
    
    if (usersWithoutStats.length === 0) {
      console.log('All users already have UserStats!');
      return;
    }
    
    // Create UserStats for each user
    for (const user of usersWithoutStats) {
      const now = new Date();
      const statsId = `stats_${user.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await prisma.userStats.create({
        data: {
          id: statsId,
          userId: user.id,
          createdAt: now,
          updatedAt: now
        } as any
      });
      
      console.log(`Created UserStats for user: ${user.username} (${user.id})`);
    }
    
    console.log(`Successfully created UserStats for ${usersWithoutStats.length} users`);
    
  } catch (error) {
    console.error('Error fixing missing UserStats:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixMissingUserStats(); 