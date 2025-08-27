import { PrismaClient } from '@prisma/client';
import { logCompletedGameToDbAndDiscord } from '../src/lib/gameLogger';

const prisma = new PrismaClient();

async function testGameLogging() {
  try {
    console.log('Testing game logging functionality...');
    
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connection successful');
    
    // Get a real user from the database
    const realUser = await prisma.user.findFirst();
    if (!realUser) {
      console.log('❌ No users found in database. Please create a user first.');
      return;
    }
    
    console.log(`✅ Using real user: ${realUser.username} (${realUser.id})`);
    
    // Create a mock game object for testing
    const mockGame: any = {
      id: 'test-game-' + Date.now(),
      dbGameId: null, // Will be created
      gameMode: 'PARTNERS' as const,
      team1TotalScore: 250,
      team2TotalScore: 200,
      buyIn: 10000,
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
          discordId: realUser.discordId,
          bid: 3,
          tricks: 4,
          bags: 1
        },
        {
          id: realUser.id, // Using same user for test
          type: 'human',
          username: realUser.username + '_2',
          discordId: realUser.discordId,
          bid: 2,
          tricks: 3,
          bags: 1
        },
        {
          id: realUser.id, // Using same user for test
          type: 'human',
          username: realUser.username + '_3',
          discordId: realUser.discordId,
          bid: 4,
          tricks: 3,
          bags: 0
        },
        {
          id: realUser.id, // Using same user for test
          type: 'human',
          username: realUser.username + '_4',
          discordId: realUser.discordId,
          bid: 4,
          tricks: 3,
          bags: 0
        }
      ],
      createdAt: Date.now() - 3600000 // 1 hour ago
    };
    
    console.log('Testing game logging with mock data...');
    await logCompletedGameToDbAndDiscord(mockGame, 1); // Team 1 wins
    
    console.log('✅ Game logging test completed successfully');
    
    // Check if the game was created in the database
    const games = await prisma.game.findMany({
      where: {
        creatorId: realUser.id
      },
      include: {
        GamePlayer: true,
        GameResult: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 1
    });
    
    if (games.length > 0) {
      const game = games[0];
      console.log('✅ Game created in database:', game.id);
      console.log('✅ Game players:', game.GamePlayer.length);
      console.log('✅ Game result:', game.GameResult ? 'created' : 'missing');
      
      if (game.GameResult) {
        console.log('✅ Final score:', game.GameResult.finalScore);
        console.log('✅ Winner:', game.GameResult.winner);
        console.log('✅ Team scores:', game.GameResult.team1Score, 'vs', game.GameResult.team2Score);
      }
    } else {
      console.log('❌ No game found in database');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testGameLogging(); 