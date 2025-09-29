import { PrismaClient as OldPrismaClient } from '@prisma/client';
import { PrismaClient as NewPrismaClient } from '../node_modules/.prisma/new-client';

const oldPrisma = new OldPrismaClient();
const newPrisma = new NewPrismaClient();

async function migrateFriendsAndBlocked() {
  console.log('Starting migration of Friend and BlockedUser data...');

  try {
    // Get all friends from old database
    const friends = await oldPrisma.friend.findMany({
      include: {
        User_Friend_friendIdToUser: true,
        User_Friend_userIdToUser: true,
      },
    });

    console.log(`Found ${friends.length} friend relationships`);

    // Import friends to new database
    for (const friend of friends) {
      try {
        // Check if both users exist in new database
        const userExists = await newPrisma.user.findUnique({
          where: { discordId: friend.User_Friend_userIdToUser.discordId },
        });
        const friendExists = await newPrisma.user.findUnique({
          where: { discordId: friend.User_Friend_friendIdToUser.discordId },
        });

        if (userExists && friendExists) {
          await newPrisma.friend.upsert({
            where: {
              userId_friendId: {
                userId: userExists.id,
                friendId: friendExists.id,
              },
            },
            update: {},
            create: {
              userId: userExists.id,
              friendId: friendExists.id,
              createdAt: friend.createdAt,
              updatedAt: friend.updatedAt,
            },
          });
        } else {
          console.log(`Skipping friend relationship: user or friend not found in new database`);
        }
      } catch (error) {
        console.error(`Error importing friend relationship:`, error);
      }
    }

    // Get all blocked users from old database
    const blockedUsers = await oldPrisma.blockedUser.findMany({
      include: {
        User_BlockedUser_blockedIdToUser: true,
        User_BlockedUser_userIdToUser: true,
      },
    });

    console.log(`Found ${blockedUsers.length} blocked user relationships`);

    // Import blocked users to new database
    for (const blocked of blockedUsers) {
      try {
        // Check if both users exist in new database
        const userExists = await newPrisma.user.findUnique({
          where: { discordId: blocked.User_BlockedUser_userIdToUser.discordId },
        });
        const blockedExists = await newPrisma.user.findUnique({
          where: { discordId: blocked.User_BlockedUser_blockedIdToUser.discordId },
        });

        if (userExists && blockedExists) {
          await newPrisma.blockedUser.upsert({
            where: {
              userId_blockedId: {
                userId: userExists.id,
                blockedId: blockedExists.id,
              },
            },
            update: {},
            create: {
              userId: userExists.id,
              blockedId: blockedExists.id,
              createdAt: blocked.createdAt,
              updatedAt: blocked.updatedAt,
            },
          });
        } else {
          console.log(`Skipping blocked user relationship: user or blocked user not found in new database`);
        }
      } catch (error) {
        console.error(`Error importing blocked user relationship:`, error);
      }
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await oldPrisma.$disconnect();
    await newPrisma.$disconnect();
  }
}

migrateFriendsAndBlocked();
