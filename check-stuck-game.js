import { ForceGameDeletionService } from './server/src/services/ForceGameDeletionService.js';
import { prisma } from './server/src/config/databaseFirst.js';

async function checkStuckGame() {
  try {
    console.log('🔍 Checking for stuck games in production...');
    
    // Check specifically for the game you mentioned
    const specificGame = await ForceGameDeletionService.getGameDetails('game_1760558983869_q31fz1uhr');
    if (specificGame.found) {
      console.log('✅ Found the specific stuck game!');
      console.log('Game details:', {
        id: specificGame.game.id,
        status: specificGame.game.status,
        isRated: specificGame.game.isRated,
        createdAt: specificGame.game.createdAt
      });
      console.log('Record counts:', specificGame.recordCounts);
    } else {
      console.log('❌ Specific game not found');
    }
    
    // Check for all stuck games
    const stuckGames = await ForceGameDeletionService.findStuckGames();
    console.log(`\nFound ${stuckGames.length} stuck games:`);
    stuckGames.forEach(game => {
      console.log(`  - ${game.id} (${game.status}, ${game.humanPlayers}/${game.totalPlayers} players)`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkStuckGame();
