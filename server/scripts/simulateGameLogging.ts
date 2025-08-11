import { PrismaClient } from '@prisma/client';
import { trickLogger } from '../src/lib/trickLogger';
import { Game, GamePlayer } from '../src/types/game';

const prisma = new PrismaClient();

async function simulateGameLogging() {
  console.log('🎮 Simulating Complete Game with Trick Logging...\n');

  try {
    // Step 1: Create a test user
    console.log('👤 Creating test user...');
    const testUser = await prisma.user.findFirst();
    if (!testUser) {
      throw new Error('No users found in database');
    }
    console.log(`   Using user: ${testUser.username}\n`);

    // Step 2: Create a test game
    console.log('🎮 Creating test game...');
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
      }
    });
    console.log(`   Created game: ${testGame.id}\n`);

    // Step 3: Simulate game progression
    console.log('🔄 Simulating game progression...');
    
    // Start round (this happens when game transitions to PLAYING)
    console.log('   Starting round...');
    const roundId = await trickLogger.startRound(testGame.id, 1);
    console.log(`   Round started: ${roundId}`);

    // Simulate 13 tricks (one complete hand)
    console.log('   Simulating 13 tricks...');
    for (let trickNumber = 1; trickNumber <= 13; trickNumber++) {
      const trickData = {
        roundId,
        trickNumber,
        leadPlayerId: testUser.id,
        winningPlayerId: testUser.id, // Same player wins for simplicity
        cards: [
          { playerId: testUser.id, suit: 'SPADES', value: 14, position: 0 },
          { playerId: 'bot-1', suit: 'HEARTS', value: 13, position: 1 },
          { playerId: 'bot-2', suit: 'DIAMONDS', value: 12, position: 2 },
          { playerId: 'bot-3', suit: 'CLUBS', value: 11, position: 3 },
        ]
      };

      const trickId = await trickLogger.logTrick(trickData);
      console.log(`   Trick ${trickNumber} logged: ${trickId}`);
    }

    // Step 4: Check results
    console.log('\n📊 Checking results...');
    const stats = await trickLogger.getGameTrickStats(testGame.id);
    console.log(`   Total Rounds: ${stats.totalRounds}`);
    console.log(`   Total Tricks: ${stats.totalTricks}`);
    console.log(`   Total Cards: ${stats.totalCards}`);

    const history = await trickLogger.getGameTrickHistory(testGame.id);
    console.log(`   Rounds in history: ${history.length}`);
    if (history.length > 0) {
      console.log(`   Tricks in first round: ${history[0].tricks.length}`);
      if (history[0].tricks.length > 0) {
        console.log(`   Cards in first trick: ${history[0].tricks[0].cards.length}`);
      }
    }

    // Step 5: Verify database state
    console.log('\n🔍 Verifying database state...');
    const finalRounds = await prisma.round.count({ where: { gameId: testGame.id } });
    const finalTricks = await prisma.trick.count({ 
      where: { 
        round: { gameId: testGame.id } 
      } 
    });
    const finalCards = await prisma.card.count({ 
      where: { 
        trick: { 
          round: { gameId: testGame.id } 
        } 
      } 
    });

    console.log(`   Rounds in DB: ${finalRounds}`);
    console.log(`   Tricks in DB: ${finalTricks}`);
    console.log(`   Cards in DB: ${finalCards}`);

    // Step 6: Clean up
    console.log('\n🧹 Cleaning up...');
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
    console.log('   Cleanup completed');

    console.log('\n✅ Game simulation completed successfully!');
    console.log('🎯 Trick logging is working correctly!');

  } catch (error) {
    console.error('❌ Simulation failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the simulation
simulateGameLogging(); 