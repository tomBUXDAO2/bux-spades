import { PrismaClient } from '@prisma/client';
import { logCompletedGameToDbAndDiscord } from '../src/lib/gameLogger';

const prisma = new PrismaClient();

async function triggerDiscordEmbed() {
  try {
    // Get the completed league game
    const game = await prisma.game.findFirst({
      where: {
        id: 'cmenk0qit00015x8bguay3msw',
        status: 'FINISHED',
        league: true
      }
    });

    if (!game) {
      console.log('Game not found or not completed');
      return;
    }

    console.log('Found completed game:', game.id);

    // Create a mock game object for the gameLogger
    const mockGame = {
      id: game.id,
      dbGameId: game.id,
      gameMode: game.gameMode,
      team1TotalScore: 350,
      team2TotalScore: 100,
      playerScores: [350, 100, 350, 100], // Mock scores
      rules: {
        bidType: game.bidType
      },
      specialRules: {},
      league: true,
      players: [
        { id: 'player1', username: 'Nichole', type: 'human' },
        { id: 'player2', username: 'GEM', type: 'human' },
        { id: 'player3', username: 'SandyRM', type: 'human' },
        { id: 'player4', username: 'RobinH', type: 'human' }
      ]
    };

    // Trigger the Discord embed
    console.log('Triggering Discord embed...');
    await logCompletedGameToDbAndDiscord(mockGame, 1); // Team 1 wins

    console.log('Discord embed triggered successfully!');
  } catch (error) {
    console.error('Error triggering Discord embed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

triggerDiscordEmbed(); 