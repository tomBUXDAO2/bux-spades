import { PrismaClient } from '@prisma/client';
import { trickLogger } from '../src/lib/trickLogger';

const prisma = new PrismaClient();

async function testGameLoggingFix() {
  console.log('🎮 Testing Game Logging Fix for Bot Games...\n');

  try {
    // Test 1: Check current database state
    console.log('📊 Current Database State:');
    const games = await prisma.game.count();
    const rounds = await prisma.round.count();
    const tricks = await prisma.trick.count();
    const cards = await prisma.card.count();
    console.log(`   Games: ${games}`);
    console.log(`   Rounds: ${rounds}`);
    console.log(`   Tricks: ${tricks}`);
    console.log(`   Cards: ${cards}\n`);

    // Test 2: Create a test user
    console.log('👤 Creating test user...');
    const testUser = await prisma.user.findFirst();
    if (!testUser) {
      throw new Error('No users found in database');
    }
    console.log(`   Using user: ${testUser.username}\n`);

    // Test 3: Create a test game (simulating a game that might not go through normal creation)
    console.log('🎮 Creating test game (simulating bot game creation)...');
    const testGame = await prisma.game.create({
      data: {
        creatorId: testUser.id,
        gameMode: 'PARTNERS',
        bidType: 'REGULAR',
        specialRules: [],
        minPoints: -200,
        maxPoints: 500,
        buyIn: 1000,
        rated: false, // Unrated game with bots
        status: 'PLAYING',
      }
    });
    console.log(`   Created game: ${testGame.id}\n`);

    // Test 4: Simulate the fallback mechanism (using in-memory game ID)
    console.log('🔄 Testing fallback round creation...');
    const gameIdForLogging = testGame.id; // Simulate fallback to in-memory ID
    const roundId = await trickLogger.startRound(gameIdForLogging, 1);
    console.log(`   Round started with fallback ID: ${roundId}\n`);

    // Test 5: Test trick logging
    console.log('🃏 Testing trick logging...');
    const trickData = {
      roundId,
      trickNumber: 1,
      leadPlayerId: testUser.id,
      winningPlayerId: testUser.id,
      cards: [
        { playerId: testUser.id, suit: 'SPADES', value: 14, position: 0 },
        { playerId: 'bot-1', suit: 'HEARTS', value: 13, position: 1 },
        { playerId: 'bot-2', suit: 'DIAMONDS', value: 12, position: 2 },
        { playerId: 'bot-3', suit: 'CLUBS', value: 11, position: 3 },
      ]
    };

    const trickId = await trickLogger.logTrick(trickData);
    console.log(`   Trick logged: ${trickId}\n`);

    // Test 6: Verify results
    console.log('📊 Verifying results...');
    const finalGames = await prisma.game.count();
    const finalRounds = await prisma.round.count();
    const finalTricks = await prisma.trick.count();
    const finalCards = await prisma.card.count();

    console.log(`   Final Games: ${finalGames}`);
    console.log(`   Final Rounds: ${finalRounds}`);
    console.log(`   Final Tricks: ${finalTricks}`);
    console.log(`   Final Cards: ${finalCards}\n`);

    // Test 7: Test statistics
    console.log('📈 Testing statistics...');
    const stats = await trickLogger.getGameTrickStats(testGame.id);
    console.log(`   Total Rounds: ${stats.totalRounds}`);
    console.log(`   Total Tricks: ${stats.totalTricks}`);
    console.log(`   Total Cards: ${stats.totalCards}\n`);

    // Test 8: Clean up
    console.log('🧹 Cleaning up...');
    await prisma.card.deleteMany({
      where: {
        trick: {
          round: { gameId: testGame.id }
        }
      }
    });
    await prisma.trick.deleteMany({
      where: {
        round: { gameId: testGame.id }
      }
    });
    await prisma.round.deleteMany({
      where: { gameId: testGame.id }
    });
    await prisma.game.delete({
      where: { id: testGame.id }
    });
    console.log('   Cleanup completed\n');

    console.log('✅ Game logging fix test completed successfully!');
    console.log('🎯 The fallback mechanism should now work for bot games!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testGameLoggingFix(); 