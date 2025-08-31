const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function triggerDiscordEmbed(gameId) {
  try {
    console.log(`Triggering Discord embed for game: ${gameId}`);
    
    // Get the game and its players
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        GamePlayer: {
          orderBy: { position: 'asc' }
        },
        GameResult: true
      }
    });
    
    if (!game) {
      console.error(`Game ${gameId} not found`);
      return;
    }
    
    if (!game.GameResult) {
      console.error(`Game ${gameId} has no GameResult`);
      return;
    }
    
    console.log('Game found:', {
      id: game.id,
      status: game.status,
      gameMode: game.gameMode,
      bidType: game.bidType,
      players: game.GamePlayer.map(p => ({
        position: p.position,
        username: p.username,
        team: p.team,
        bid: p.bid,
        bags: p.bags,
        points: p.points,
        won: p.won
      }))
    });
    
    // Import the Discord bot functions
    const { sendLeagueGameResults } = require('../src/discord-bot/bot');
    
    // Create game data object in the format expected by sendLeagueGameResults
    const gameData = {
      id: game.id,
      gameMode: game.gameMode,
      bidType: game.bidType,
      buyIn: game.buyIn,
      players: game.GamePlayer.map(p => ({
        userId: p.discordId || p.userId,
        username: p.username,
        position: p.position,
        team: p.team,
        bid: p.bid,
        bags: p.bags,
        points: p.points,
        won: p.won
      })),
      team1Score: game.GameResult.team1Score,
      team2Score: game.GameResult.team2Score,
      winner: game.GameResult.winner
    };
    
    // Create game line string
    const gameLine = `${game.buyIn >= 1000000 ? `${game.buyIn / 1000000}M` : `${game.buyIn / 1000}k`} ${game.gameMode} ${game.maxPoints}/${game.minPoints} ${game.bidType}`;
    
    // Trigger the embed
    await sendLeagueGameResults(gameData, gameLine);
    
    console.log('Discord embed triggered successfully!');
    
  } catch (error) {
    console.error('Error triggering Discord embed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get game ID from command line argument
const gameId = process.argv[2];
if (!gameId) {
  console.error('Please provide a game ID as an argument');
  process.exit(1);
}

triggerDiscordEmbed(gameId); 