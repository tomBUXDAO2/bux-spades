import { PrismaClient } from '@prisma/client';
import { logCompletedGameToDbAndDiscord } from '../src/lib/gameLogger';

const prisma = new PrismaClient();

async function triggerDiscordEmbed() {
  try {
    const gameId = 'cmeufuo1o018kxq2e4o7aaqqg';
    
    console.log('Triggering Discord embed for game:', gameId);
    
    // Get the game
    const game = await prisma.game.findUnique({
      where: { id: gameId }
    });

    if (!game) {
      console.log('Game not found');
      return;
    }

    // Get the players
    const players = await prisma.gamePlayer.findMany({
      where: { gameId },
      orderBy: { position: 'asc' }
    });

    // Get the game result
    const gameResult = await prisma.gameResult.findUnique({
      where: { gameId }
    });

    if (!gameResult) {
      console.log('GameResult not found');
      return;
    }

    console.log('Found GameResult - Winner:', gameResult.winner, 'Team 1 Score:', gameResult.team1Score, 'Team 2 Score:', gameResult.team2Score);

    // Create mock game object for Discord embed
    const mockGame = {
      id: game.id,
      dbGameId: game.id,
      gameMode: game.gameMode,
      team1TotalScore: gameResult.team1Score,
      team2TotalScore: gameResult.team2Score,
      rules: {
        bidType: game.bidType
      },
      specialRules: {},
      league: true,
      buyIn: game.buyIn,
      maxPoints: game.maxPoints,
      minPoints: game.minPoints,
      players: players.map(p => ({
        id: p.userId,
        discordId: p.discordId,
        username: p.username,
        type: 'human'
      }))
    };

    console.log('Triggering Discord embed...');
    await logCompletedGameToDbAndDiscord(mockGame, gameResult.winner);

    console.log('✅ Discord embed triggered successfully!');

  } catch (error) {
    console.error('Error triggering Discord embed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

triggerDiscordEmbed(); 