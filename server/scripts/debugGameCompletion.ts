import { prisma } from '../src/lib/prisma';
import { logCompletedGameToDbAndDiscord } from '../src/lib/gameLogger';

async function debugGameCompletion() {
  try {
    // Get the latest league game
    const latestGame = await prisma.game.findFirst({
      where: { league: true },
      orderBy: { createdAt: 'desc' }
    });

    if (!latestGame) {
      console.log('No league games found');
      return;
    }

    console.log('Latest league game:', {
      id: latestGame.id,
      status: latestGame.status,
      rated: latestGame.rated,
      league: latestGame.league,
      createdAt: latestGame.createdAt
    });

    // Check if GameResult exists
    const gameResult = await prisma.gameResult.findUnique({
      where: { gameId: latestGame.id }
    });

    console.log('GameResult exists:', !!gameResult);

    if (!gameResult) {
      console.log('Creating mock game object to test gameLogger...');
      
      // Create a mock game object based on the database data
      const mockGame = {
        id: latestGame.id,
        dbGameId: latestGame.id,
        gameMode: latestGame.gameMode,
        league: latestGame.league,
        rated: latestGame.rated,
        team1TotalScore: 500, // Mock scores
        team2TotalScore: 400,
        players: [
          { id: 'player1', username: 'tom_buxdao', type: 'human', tricks: 3, bid: 0 },
          { id: 'player2', username: 'blondeartiste', type: 'human', tricks: 4, bid: 4 },
          { id: 'player3', username: 'nichole.foutz', type: 'human', tricks: 3, bid: 5 },
          { id: 'player4', username: 'karenu1968', type: 'human', tricks: 3, bid: 2 }
        ],
        rules: { bidType: 'REGULAR' },
        specialRules: {}
      };

      console.log('Calling gameLogger with mock game...');
      await logCompletedGameToDbAndDiscord(mockGame, 1); // Team 1 wins
      console.log('GameLogger completed successfully');
    }

  } catch (error) {
    console.error('Error debugging game completion:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugGameCompletion(); 