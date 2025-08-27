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

    // Calculate the actual game scores from the tricks and bids
    const rounds = await prisma.round.findMany({
      where: { gameId },
      orderBy: { roundNumber: 'asc' }
    });

    let team1Score = 0;
    let team2Score = 0;

    for (const round of rounds) {
      const tricks = await prisma.trick.findMany({
        where: { roundId: round.id },
        orderBy: { trickNumber: 'asc' }
      });

      // Count tricks won by each team
      let team1Tricks = 0;
      let team2Tricks = 0;
      for (const trick of tricks) {
        const winningPlayer = players.find(p => p.userId === trick.winningPlayerId);
        if (winningPlayer) {
          if (winningPlayer.team === 1) {
            team1Tricks++;
          } else if (winningPlayer.team === 2) {
            team2Tricks++;
          }
        }
      }

      // Calculate scores for this round based on bids and tricks
      const team1Bid = players.filter(p => p.team === 1).reduce((sum, p) => sum + (p.bid || 0), 0);
      const team2Bid = players.filter(p => p.team === 2).reduce((sum, p) => sum + (p.bid || 0), 0);

      // Calculate round scores
      if (team1Tricks >= team1Bid) {
        team1Score += team1Bid * 10; // 10 points per trick for making bid
        if (team1Tricks > team1Bid) {
          team1Score -= (team1Tricks - team1Bid); // -1 point per bag
        }
      } else {
        team1Score -= team1Bid * 10; // -10 points per trick for not making bid
      }

      if (team2Tricks >= team2Bid) {
        team2Score += team2Bid * 10; // 10 points per trick for making bid
        if (team2Tricks > team2Bid) {
          team2Score -= (team2Tricks - team2Bid); // -1 point per bag
        }
      } else {
        team2Score -= team2Bid * 10; // -10 points per trick for not making bid
      }

      // Handle nil bids (need to check if players bid nil)
      // For now, we'll use the bags as a proxy for nil penalties
      const team1Bags = players.filter(p => p.team === 1).reduce((sum, p) => sum + (p.bags || 0), 0);
      const team2Bags = players.filter(p => p.team === 2).reduce((sum, p) => sum + (p.bags || 0), 0);
      
      // Apply bag penalties
      team1Score -= team1Bags;
      team2Score -= team2Bags;
    }

    console.log('Calculated actual game scores - Team 1:', team1Score, 'Team 2:', team2Score);

    // Create game object using actual game data from database
    const mockGame = {
      id: game.id,
      dbGameId: game.id,
      gameMode: game.gameMode,
      team1TotalScore: team1Score,
      team2TotalScore: team2Score,
      rules: {
        bidType: game.bidType,
        allowNil: game.allowNil,
        allowBlindNil: game.allowBlindNil
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