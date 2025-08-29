import { prisma } from '../src/lib/prisma';

async function clearAllGameData() {
  try {
    console.log('Starting to clear all game-related data...');
    
    // Delete in the correct order to respect foreign key constraints
    console.log('Deleting GameResult records...');
    const gameResultsDeleted = await prisma.gameResult.deleteMany({});
    console.log(`Deleted ${gameResultsDeleted.count} GameResult records`);
    
    console.log('Deleting Card records...');
    const cardsDeleted = await prisma.card.deleteMany({});
    console.log(`Deleted ${cardsDeleted.count} Card records`);
    
    console.log('Deleting Trick records...');
    const tricksDeleted = await prisma.trick.deleteMany({});
    console.log(`Deleted ${tricksDeleted.count} Trick records`);
    
    console.log('Deleting Round records...');
    const roundsDeleted = await prisma.round.deleteMany({});
    console.log(`Deleted ${roundsDeleted.count} Round records`);
    
    console.log('Deleting GamePlayer records...');
    const gamePlayersDeleted = await prisma.gamePlayer.deleteMany({});
    console.log(`Deleted ${gamePlayersDeleted.count} GamePlayer records`);
    
    console.log('Deleting Game records...');
    const gamesDeleted = await prisma.game.deleteMany({});
    console.log(`Deleted ${gamesDeleted.count} Game records`);
    
    // Verify what's left
    console.log('\nVerifying remaining data...');
    
    const remainingGames = await prisma.game.count();
    const remainingGamePlayers = await prisma.gamePlayer.count();
    const remainingRounds = await prisma.round.count();
    const remainingTricks = await prisma.trick.count();
    const remainingCards = await prisma.card.count();
    const remainingGameResults = await prisma.gameResult.count();
    
    const remainingUsers = await prisma.user.count();
    const remainingFriends = await prisma.friend.count();
    const remainingBlocked = await prisma.blockedUser.count();
    
    console.log('\n=== CLEARANCE SUMMARY ===');
    console.log('Game data cleared:');
    console.log(`- Games: ${remainingGames} (should be 0)`);
    console.log(`- GamePlayers: ${remainingGamePlayers} (should be 0)`);
    console.log(`- Rounds: ${remainingRounds} (should be 0)`);
    console.log(`- Tricks: ${remainingTricks} (should be 0)`);
    console.log(`- Cards: ${remainingCards} (should be 0)`);
    console.log(`- GameResults: ${remainingGameResults} (should be 0)`);
    
    console.log('\nUser data preserved:');
    console.log(`- Users: ${remainingUsers} (preserved)`);
    console.log(`- Friendships: ${remainingFriends} (preserved)`);
    console.log(`- Blocked users: ${remainingBlocked} (preserved)`);
    
    if (remainingGames === 0 && remainingGamePlayers === 0 && remainingRounds === 0 && 
        remainingTricks === 0 && remainingCards === 0 && remainingGameResults === 0) {
      console.log('\n✅ SUCCESS: All game data cleared successfully!');
    } else {
      console.log('\n❌ WARNING: Some game data may still remain');
    }
    
  } catch (error) {
    console.error('Error clearing game data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearAllGameData(); 