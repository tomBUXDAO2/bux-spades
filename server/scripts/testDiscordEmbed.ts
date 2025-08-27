import { PrismaClient } from '@prisma/client';
import { logCompletedGameToDbAndDiscord } from '../src/lib/gameLogger';

const prisma = new PrismaClient();

async function testDiscordEmbed() {
  try {
    console.log('Testing Discord embed functionality...');
    
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connection successful');
    
    // Get a user with a real Discord ID
    const realUser = await prisma.user.findFirst({
      where: {
        discordId: {
          not: null
        }
      }
    });
    
    if (!realUser || !realUser.discordId) {
      console.log('❌ No users with Discord IDs found in database.');
      return;
    }
    
    console.log(`✅ Using user with Discord ID: ${realUser.username} (Discord: ${realUser.discordId})`);
    
    // Create a mock game object for testing with real Discord IDs
    const mockGame: any = {
      id: 'test-discord-game-' + Date.now(),
      dbGameId: null, // Will be created
      gameMode: 'PARTNERS' as const,
      team1TotalScore: 350,
      team2Score: 200,
      buyIn: 50000,
      minPoints: 250,
      maxPoints: 500,
      rules: {
        bidType: 'REGULAR',
        allowNil: true,
        allowBlindNil: false
      },
      specialRules: {},
      league: true,
      players: [
        {
          id: realUser.id,
          type: 'human',
          username: realUser.username,
          discordId: realUser.discordId, // Real Discord ID
          bid: 4,
          tricks: 5,
          bags: 1
        },
        {
          id: realUser.id,
          type: 'human',
          username: realUser.username + '_2',
          discordId: realUser.discordId, // Real Discord ID
          bid: 3,
          tricks: 4,
          bags: 1
        },
        {
          id: realUser.id,
          type: 'human',
          username: realUser.username + '_3',
          discordId: realUser.discordId, // Real Discord ID
          bid: 2,
          tricks: 2,
          bags: 0
        },
        {
          id: realUser.id,
          type: 'human',
          username: realUser.username + '_4',
          discordId: realUser.discordId, // Real Discord ID
          bid: 4,
          tricks: 2,
          bags: 0
        }
      ],
      createdAt: Date.now() - 3600000 // 1 hour ago
    };
    
    console.log('Testing Discord embed with real Discord IDs...');
    console.log('This should post a Discord embed to your results channel!');
    
    await logCompletedGameToDbAndDiscord(mockGame, 1); // Team 1 wins
    
    console.log('✅ Discord embed test completed!');
    console.log('Check your Discord results channel for the embed.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testDiscordEmbed(); 