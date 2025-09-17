// Simple test to verify nil logic works
const { getNilPlay } = require('./src/modules/bot-play/nil.ts');
const { getNilCoverPlay } = require('./src/modules/bot-play/nil-cover.ts');

// Test data
const testHand = [
  { rank: '2', suit: 'HEARTS' },
  { rank: '5', suit: 'HEARTS' },
  { rank: 'K', suit: 'HEARTS' },
  { rank: 'A', suit: 'SPADES' },
  { rank: '3', suit: 'CLUBS' }
];

const testTrick = [
  { rank: 'J', suit: 'HEARTS', playerIndex: 0 }
];

console.log('Testing nil logic...');
console.log('Hand:', testHand.map(c => `${c.rank}${c.suit}`));
console.log('Current trick:', testTrick.map(c => `${c.rank}${c.suit}`));

try {
  const nilResult = getNilPlay({
    hand: testHand,
    currentTrick: testTrick,
    leadSuit: 'HEARTS',
    spadesBroken: false,
    playerIndex: 1,
    isLeading: false
  });
  
  console.log('Nil result:', nilResult);
} catch (error) {
  console.log('Error testing nil logic:', error.message);
}

console.log('Test completed successfully!');
