import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearGameStats() {
  try {
    console.log('Starting to clear game and player stats...');
    console.log('This will preserve:');
    console.log('- All user accounts and logins');
    console.log('- All coins (reset to 5M)');
    console.log('- All friend lists');
    console.log('- All block lists');
    console.log('');
    
    // First, let's get counts of what we're about to delete
    const gameCount = await prisma.game.count();
    const gamePlayerCount = await prisma.gamePlayer.count();
    const gameResultCount = await prisma.gameResult.count();
    const roundCount = await prisma.round.count();
    const trickCount = await prisma.trick.count();
    const cardCount = await prisma.card.count();
    const userStatsCount = await prisma.userStats.count();
    const userGameStatsCount = await prisma.userGameStats.count();
    
    console.log('Current database state:');
    console.log(`- Games: ${gameCount}`);
    console.log(`- Game Players: ${gamePlayerCount}`);
    console.log(`- Game Results: ${gameResultCount}`);
    console.log(`- Rounds: ${roundCount}`);
    console.log(`- Tricks: ${trickCount}`);
    console.log(`- Cards: ${cardCount}`);
    console.log(`- User Stats: ${userStatsCount}`);
    console.log(`- User Game Stats: ${userGameStatsCount}`);
    console.log('');
    
    // Get user count before clearing
    const userCount = await prisma.user.count();
    const friendCount = await prisma.friend.count();
    const blockedUserCount = await prisma.blockedUser.count();
    
    console.log('Will preserve:');
    console.log(`- Users: ${userCount}`);
    console.log(`- Friends: ${friendCount}`);
    console.log(`- Blocked Users: ${blockedUserCount}`);
    console.log('');
    
    // Confirm with user
    console.log('Are you sure you want to proceed? This will delete all game data!');
    console.log('Type "YES" to continue:');
    
    // For safety, we'll require manual confirmation
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise((resolve) => {
      rl.question('', (input: string) => {
        rl.close();
        resolve(input);
      });
    });
    
    if (answer !== 'YES') {
      console.log('Operation cancelled.');
      return;
    }
    
    console.log('Proceeding with clearing game stats...');
    
    // Delete in the correct order to avoid foreign key constraints
    console.log('1. Deleting cards...');
    await prisma.card.deleteMany();
    
    console.log('2. Deleting tricks...');
    await prisma.trick.deleteMany();
    
    console.log('3. Deleting rounds...');
    await prisma.round.deleteMany();
    
    console.log('4. Deleting game results...');
    await prisma.gameResult.deleteMany();
    
    console.log('5. Deleting game players...');
    await prisma.gamePlayer.deleteMany();
    
    console.log('6. Deleting games...');
    await prisma.game.deleteMany();
    
    console.log('7. Deleting user stats...');
    await prisma.userStats.deleteMany();
    
    console.log('8. Deleting user game stats...');
    await prisma.userGameStats.deleteMany();
    
    console.log('9. Resetting all user coins to 5M...');
    await prisma.user.updateMany({
      data: {
        coins: 5000000
      }
    });
    
    // Verify the cleanup
    const finalGameCount = await prisma.game.count();
    const finalGamePlayerCount = await prisma.gamePlayer.count();
    const finalGameResultCount = await prisma.gameResult.count();
    const finalRoundCount = await prisma.round.count();
    const finalTrickCount = await prisma.trick.count();
    const finalCardCount = await prisma.card.count();
    const finalUserStatsCount = await prisma.userStats.count();
    const finalUserGameStatsCount = await prisma.userGameStats.count();
    const finalUserCount = await prisma.user.count();
    const finalFriendCount = await prisma.friend.count();
    const finalBlockedUserCount = await prisma.blockedUser.count();
    
    console.log('');
    console.log('✅ Cleanup completed successfully!');
    console.log('');
    console.log('Final database state:');
    console.log(`- Games: ${finalGameCount} (was ${gameCount})`);
    console.log(`- Game Players: ${finalGamePlayerCount} (was ${gamePlayerCount})`);
    console.log(`- Game Results: ${finalGameResultCount} (was ${gameResultCount})`);
    console.log(`- Rounds: ${finalRoundCount} (was ${roundCount})`);
    console.log(`- Tricks: ${finalTrickCount} (was ${trickCount})`);
    console.log(`- Cards: ${finalCardCount} (was ${cardCount})`);
    console.log(`- User Stats: ${finalUserStatsCount} (was ${userStatsCount})`);
    console.log(`- User Game Stats: ${finalUserGameStatsCount} (was ${userGameStatsCount})`);
    console.log('');
    console.log('Preserved:');
    console.log(`- Users: ${finalUserCount} (unchanged)`);
    console.log(`- Friends: ${finalFriendCount} (unchanged)`);
    console.log(`- Blocked Users: ${finalBlockedUserCount} (unchanged)`);
    console.log('');
    console.log('All user coins have been reset to 5,000,000');
    console.log('All game and player stats have been cleared');
    console.log('User accounts, friends, and block lists are preserved');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearGameStats(); 