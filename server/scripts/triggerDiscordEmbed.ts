import { PrismaClient } from '@prisma/client';
import { logCompletedGameToDbAndDiscord } from '../src/lib/gameLogger';

const prisma = new PrismaClient();

async function triggerDiscordEmbed() {
  try {
    // Get the completed league game
    const game = await prisma.game.findFirst({
      where: {
        id: 'cmenlrf4w0001yueg0uakbbre',
        status: 'FINISHED',
        league: true
      }
    });

    if (!game) {
      console.log('Game not found or not completed');
      return;
    }

    console.log('Found completed game:', game.id);

    // Get the actual GamePlayer records with Discord IDs
    const gamePlayers = await prisma.gamePlayer.findMany({
      where: { gameId: game.id }
    });

    console.log('GamePlayer records:', gamePlayers);

    // Create a mock game object for the gameLogger with real player data
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
      buyIn: 200000,
      maxPoints: 350,
      minPoints: -100,
      players: gamePlayers.map((gp, i) => ({
        id: gp.userId,
        discordId: gp.discordId,
        username: gp.username,
        type: 'human'
      }))
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