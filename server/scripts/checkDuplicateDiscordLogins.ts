import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDuplicateDiscordLogins() {
  try {
    console.log('🔍 Checking for users with multiple Discord logins...\n');

    // Get all users with Discord IDs
    const usersWithDiscord = await prisma.user.findMany({
      where: {
        discordId: { not: null }
      },
      select: {
        id: true,
        username: true,
        email: true,
        discordId: true,
        createdAt: true
      },
      orderBy: {
        username: 'asc'
      }
    });

    console.log(`Found ${usersWithDiscord.length} users with Discord IDs\n`);

    // Group by username to find duplicates
    const usersByUsername = new Map<string, any[]>();
    
    usersWithDiscord.forEach(user => {
      if (!usersByUsername.has(user.username)) {
        usersByUsername.set(user.username, []);
      }
      usersByUsername.get(user.username)!.push(user);
    });

    // Find users with multiple Discord IDs
    const duplicates = Array.from(usersByUsername.entries())
      .filter(([username, users]) => users.length > 1);

    if (duplicates.length === 0) {
      console.log('✅ No users found with multiple Discord logins');
      return;
    }

    console.log(`❌ Found ${duplicates.length} users with multiple Discord logins:\n`);

    duplicates.forEach(([username, users]) => {
      console.log(`👤 **${username}** (${users.length} accounts):`);
      users.forEach(user => {
        console.log(`   - ID: ${user.id}`);
        console.log(`   - Discord ID: ${user.discordId}`);
        console.log(`   - Email: ${user.email}`);
        console.log(`   - Created: ${user.createdAt}`);
        console.log('');
      });
    });

    // Also check for duplicate Discord IDs
    const discordIdCounts = new Map<string, any[]>();
    
    usersWithDiscord.forEach(user => {
      if (!discordIdCounts.has(user.discordId!)) {
        discordIdCounts.set(user.discordId!, []);
      }
      discordIdCounts.get(user.discordId!)!.push(user);
    });

    const duplicateDiscordIds = Array.from(discordIdCounts.entries())
      .filter(([discordId, users]) => users.length > 1);

    if (duplicateDiscordIds.length > 0) {
      console.log(`❌ Found ${duplicateDiscordIds.length} Discord IDs used by multiple users:\n`);
      
      duplicateDiscordIds.forEach(([discordId, users]) => {
        console.log(`🆔 **Discord ID: ${discordId}** (${users.length} users):`);
        users.forEach(user => {
          console.log(`   - Username: ${user.username}`);
          console.log(`   - User ID: ${user.id}`);
          console.log(`   - Email: ${user.email}`);
          console.log('');
        });
      });
    }

  } catch (error) {
    console.error('Error checking duplicate Discord logins:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDuplicateDiscordLogins(); 