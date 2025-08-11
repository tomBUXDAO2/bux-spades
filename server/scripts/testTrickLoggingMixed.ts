import { PrismaClient } from '@prisma/client';
import { trickLogger } from '../src/lib/trickLogger';

const prisma = new PrismaClient();

async function testTrickLoggingMixed() {
  console.log('🧪 Testing Trick Logging for Mixed Games (Rated & Unrated)...\n');

  try {
    // Test 1: Check current database state
    console.log('📊 Current Database State:');
    const rounds = await prisma.round.count();
    const tricks = await prisma.trick.count();
    const cards = await prisma.card.count();
    console.log(`   Rounds: ${rounds}`);
    console.log(`   Tricks: ${tricks}`);
    console.log(`   Cards: ${cards}\n`);

    // Test 2: Create test users
    console.log('👥 Creating Test Users:');
    const testUsers = [];
    for (let i = 1; i <= 4; i++) {
      const user = await prisma.user.create({
        data: {
          username: `testuser${i}`,
          email: `testuser${i}@test.com`,
          coins: 5000000,
        }
      });
      testUsers.push(user);
      console.log(`   Created user: ${user.username} (${user.id})`);
    }
    console.log('');

    // Test 3: Create a rated game (all human players)
    console.log('🎮 Creating Rated Game (All Human Players):');
    const ratedGame = await prisma.game.create({
      data: {
        creatorId: testUsers[0].id,
        gameMode: 'PARTNERS',
        bidType: 'REGULAR',
        specialRules: [],
        minPoints: -200,
        maxPoints: 500,
        buyIn: 1000,
        rated: true,
      }
    });
    console.log(`   Created rated game with ID: ${ratedGame.id}\n`);

    // Test 4: Create an unrated game (with bots)
    console.log('🤖 Creating Unrated Game (With Bots):');
    const unratedGame = await prisma.game.create({
      data: {
        creatorId: testUsers[0].id,
        gameMode: 'PARTNERS',
        bidType: 'REGULAR',
        specialRules: [],
        minPoints: -200,
        maxPoints: 500,
        buyIn: 1000,
        rated: false,
      }
    });
    console.log(`   Created unrated game with ID: ${unratedGame.id}\n`);

    // Test 5: Test round creation for both games
    console.log('🔄 Testing Round Creation:');
    const ratedRoundId = await trickLogger.startRound(ratedGame.id, 1);
    console.log(`   Created rated round with ID: ${ratedRoundId}`);
    
    const unratedRoundId = await trickLogger.startRound(unratedGame.id, 1);
    console.log(`   Created unrated round with ID: ${unratedRoundId}\n`);

    // Test 6: Test trick logging for both games
    console.log('🃏 Testing Trick Logging:');
    
    // Rated game trick
    const ratedTrickData = {
      roundId: ratedRoundId,
      trickNumber: 1,
      leadPlayerId: testUsers[0].id,
      winningPlayerId: testUsers[1].id,
      cards: [
        { playerId: testUsers[0].id, suit: 'SPADES', value: 14, position: 0 },
        { playerId: testUsers[1].id, suit: 'HEARTS', value: 13, position: 1 },
        { playerId: testUsers[2].id, suit: 'DIAMONDS', value: 12, position: 2 },
        { playerId: testUsers[3].id, suit: 'CLUBS', value: 11, position: 3 },
      ]
    };
    const ratedTrickId = await trickLogger.logTrick(ratedTrickData);
    console.log(`   Created rated trick with ID: ${ratedTrickId}`);

    // Unrated game trick
    const unratedTrickData = {
      roundId: unratedRoundId,
      trickNumber: 1,
      leadPlayerId: testUsers[0].id,
      winningPlayerId: testUsers[0].id, // Same player (bot scenario)
      cards: [
        { playerId: testUsers[0].id, suit: 'SPADES', value: 14, position: 0 },
        { playerId: 'bot-1', suit: 'HEARTS', value: 13, position: 1 },
        { playerId: 'bot-2', suit: 'DIAMONDS', value: 12, position: 2 },
        { playerId: 'bot-3', suit: 'CLUBS', value: 11, position: 3 },
      ]
    };
    const unratedTrickId = await trickLogger.logTrick(unratedTrickData);
    console.log(`   Created unrated trick with ID: ${unratedTrickId}\n`);

    // Test 7: Test statistics for both games
    console.log('📈 Testing Statistics:');
    const ratedStats = await trickLogger.getGameTrickStats(ratedGame.id);
    console.log(`   Rated Game Stats - Rounds: ${ratedStats.totalRounds}, Tricks: ${ratedStats.totalTricks}, Cards: ${ratedStats.totalCards}`);
    
    const unratedStats = await trickLogger.getGameTrickStats(unratedGame.id);
    console.log(`   Unrated Game Stats - Rounds: ${unratedStats.totalRounds}, Tricks: ${unratedStats.totalTricks}, Cards: ${unratedStats.totalCards}\n`);

    // Test 8: Test trick history for both games
    console.log('📚 Testing Trick History:');
    const ratedHistory = await trickLogger.getGameTrickHistory(ratedGame.id);
    console.log(`   Rated Game History - Rounds: ${ratedHistory.length}, Tricks: ${ratedHistory[0]?.tricks?.length || 0}`);
    
    const unratedHistory = await trickLogger.getGameTrickHistory(unratedGame.id);
    console.log(`   Unrated Game History - Rounds: ${unratedHistory.length}, Tricks: ${unratedHistory[0]?.tricks?.length || 0}\n`);

    // Test 9: Clean up
    console.log('🧹 Cleaning up test data...');
    
    // Delete cards
    await prisma.card.deleteMany({
      where: {
        trick: {
          round: {
            gameId: { in: [ratedGame.id, unratedGame.id] }
          }
        }
      }
    });
    
    // Delete tricks
    await prisma.trick.deleteMany({
      where: {
        round: {
          gameId: { in: [ratedGame.id, unratedGame.id] }
        }
      }
    });
    
    // Delete rounds
    await prisma.round.deleteMany({
      where: {
        gameId: { in: [ratedGame.id, unratedGame.id] }
      }
    });
    
    // Delete games
    await prisma.game.deleteMany({
      where: {
        id: { in: [ratedGame.id, unratedGame.id] }
      }
    });
    
    // Delete test users
    await prisma.user.deleteMany({
      where: {
        id: { in: testUsers.map(u => u.id) }
      }
    });
    
    console.log('   Test data cleaned up\n');

    console.log('✅ All mixed game tests completed successfully!');
    console.log('🎯 Trick logging works for both RATED and UNRATED games!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testTrickLoggingMixed(); 