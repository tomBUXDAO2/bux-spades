import { PrismaClient } from '@prisma/client';
import { logCompletedGameToDbAndDiscord } from '../src/lib/gameLogger';

const prisma = new PrismaClient();

async function fixMissingGameResult() {
  try {
    const gameId = 'cmeufuo1o018kxq2e4o7aaqqg';
    
    console.log('Fixing missing GameResult for game:', gameId);
    
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

    // Calculate the actual scores from the tricks
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
      for (const trick of tricks) {
        const winningPlayer = players.find(p => p.userId === trick.winningPlayerId);
        if (winningPlayer) {
          if (winningPlayer.team === 1) {
            team1Score++;
          } else if (winningPlayer.team === 2) {
            team2Score++;
          }
        }
      }
    }

    console.log('Calculated scores - Team 1:', team1Score, 'Team 2:', team2Score);

    // Determine winner
    const winner = team1Score > team2Score ? 1 : 2;
    const finalScore = Math.max(team1Score, team2Score);

    console.log('Winner:', winner, 'Final Score:', finalScore);

    // Create the missing GameResult
    const gameResult = await prisma.gameResult.create({
      data: {
        gameId: game.id,
        winner,
        finalScore,
        gameDuration: Math.floor((Date.now() - game.createdAt.getTime()) / 1000),
        team1Score,
        team2Score,
        playerResults: {
          players: players.map((p, i) => ({
            position: i,
            userId: p.userId,
            discordId: p.discordId,
            username: p.username,
            team: p.team,
            finalBid: p.bid,
            finalTricks: 0, // We don't store this per player
            finalBags: p.bags,
            finalScore: 0, // Not used in partners mode
            won: p.team === winner
          }))
        },
        totalRounds: rounds.length,
        totalTricks: rounds.reduce((total, round) => total + 13, 0), // 13 tricks per round
        specialEvents: { nils: {}, totalHands: rounds.length }
      }
    });

    console.log('Created GameResult:', gameResult.id);

    // Now trigger the Discord embed
    const mockGame = {
      id: game.id,
      dbGameId: game.id,
      gameMode: game.gameMode,
      team1TotalScore: team1Score,
      team2TotalScore: team2Score,
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
    await logCompletedGameToDbAndDiscord(mockGame, winner);

    console.log('✅ Fixed missing GameResult and triggered Discord embed!');

  } catch (error) {
    console.error('Error fixing missing GameResult:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixMissingGameResult(); 