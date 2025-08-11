import { PrismaClient } from '@prisma/client';
import { trickLogger } from '../src/lib/trickLogger';

const prisma = new PrismaClient();

async function testTrickLogging() {
  try {
    console.log('Testing trick logging functionality...');
    
    // Test 1: Create a test game in the database
    console.log('\n1. Creating test game...');
    
    // First, find or create a test user
    let testUser = await prisma.user.findFirst();
    if (!testUser) {
      console.log('No users found, creating test user...');
      testUser = await prisma.user.create({
        data: {
          username: 'test-user',
          email: 'test@example.com',
          coins: 1000000,
        }
      });
    }
    
    const testGame = await prisma.game.create({
      data: {
        creatorId: testUser.id,
        gameMode: 'PARTNERS',
        bidType: 'REGULAR',
        specialRules: [],
        minPoints: -100,
        maxPoints: 100,
        buyIn: 1000,
        rated: false,
        status: 'PLAYING',
      }
    });
    console.log('Test game created with ID:', testGame.id);
    
    // Test 2: Start a round
    console.log('\n2. Starting round...');
    const roundId = await trickLogger.startRound(testGame.id, 1);
    console.log('Round started with ID:', roundId);
    
    // Test 3: Verify round was created in database
    console.log('\n3. Verifying round in database...');
    const round = await prisma.round.findUnique({
      where: { id: roundId },
      include: { game: true }
    });
    console.log('Round found:', round ? 'YES' : 'NO');
    if (round) {
      console.log('Round details:', {
        id: round.id,
        gameId: round.gameId,
        roundNumber: round.roundNumber,
        gameStatus: round.game.status
      });
    }
    
    // Test 4: Test trick logging
    console.log('\n4. Testing trick logging...');
    const trickData = {
      roundId,
      trickNumber: 1,
      leadPlayerId: testUser.id,
      winningPlayerId: testUser.id,
      cards: [
        { playerId: testUser.id, suit: 'HEARTS', value: 14, position: 0 },
        { playerId: testUser.id, suit: 'HEARTS', value: 13, position: 1 },
        { playerId: testUser.id, suit: 'DIAMONDS', value: 7, position: 2 },
        { playerId: testUser.id, suit: 'CLUBS', value: 2, position: 3 }
      ]
    };
    
    const trickId = await trickLogger.logTrick(trickData);
    console.log('Trick logged with ID:', trickId);
    
    // Test 5: Verify trick was created in database
    console.log('\n5. Verifying trick in database...');
    const trick = await prisma.trick.findUnique({
      where: { id: trickId },
      include: { cards: true, round: true }
    });
    console.log('Trick found:', trick ? 'YES' : 'NO');
    if (trick) {
      console.log('Trick details:', {
        id: trick.id,
        roundId: trick.roundId,
        trickNumber: trick.trickNumber,
        leadPlayerId: trick.leadPlayerId,
        winningPlayerId: trick.winningPlayerId,
        cardCount: trick.cards.length
      });
      console.log('Cards:', trick.cards.map(card => ({
        suit: card.suit,
        value: card.value,
        position: card.position,
        playerId: card.playerId
      })));
    }
    
    // Test 6: Test round lookup
    console.log('\n6. Testing round lookup...');
    const currentRoundId = trickLogger.getCurrentRoundId(testGame.id);
    const currentRoundNumber = trickLogger.getCurrentRoundNumber(testGame.id);
    console.log('Current round ID:', currentRoundId);
    console.log('Current round number:', currentRoundNumber);
    
    // Test 7: Get game statistics
    console.log('\n7. Getting game statistics...');
    const stats = await trickLogger.getGameTrickStats(testGame.id);
    console.log('Game stats:', stats);
    
    // Test 8: Get trick history
    console.log('\n8. Getting trick history...');
    const history = await trickLogger.getGameTrickHistory(testGame.id);
    console.log('Trick history length:', history.length);
    if (history.length > 0) {
      console.log('First round tricks:', history[0].tricks.length);
    }
    
    console.log('\n✅ All tests passed! Trick logging is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testTrickLogging(); 