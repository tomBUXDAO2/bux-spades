import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function forceCompleteGame() {
  try {
    // Get the most recent league game that's stuck in PLAYING status
    const game = await prisma.game.findFirst({
      where: {
        status: 'PLAYING',
        league: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!game) {
      console.log('No league game found in PLAYING status');
      return;
    }

    console.log('Found game to force complete:', game.id);

    // Update the game status to FINISHED
    await prisma.game.update({
      where: { id: game.id },
      data: {
        status: 'FINISHED',
        completed: true,
        finalScore: 350, // Default score for testing
        winner: 1 // Default winner for testing
      }
    });

    console.log('Game status updated to FINISHED');

    // Create a GameResult record
    await prisma.gameResult.create({
      data: {
        gameId: game.id,
        winner: 1, // Team 1 wins
        finalScore: 350,
        team1Score: 350,
        team2Score: 100,
        playerResults: {}, // Empty JSON for now
        totalRounds: 1,
        totalTricks: 13
      }
    });

    console.log('GameResult record created');

    // Update GamePlayer records with final scores
    const gamePlayers = await prisma.gamePlayer.findMany({
      where: { gameId: game.id }
    });

    for (const player of gamePlayers) {
      await prisma.gamePlayer.update({
        where: { id: player.id },
        data: {
          finalScore: player.team === 1 ? 350 : 100,
          finalBags: 5,
          finalPoints: player.team === 1 ? 350 : 100,
          won: player.team === 1
        }
      });
    }

    console.log('GamePlayer records updated with final scores');

    console.log('Game force completed successfully!');
  } catch (error) {
    console.error('Error force completing game:', error);
  } finally {
    await prisma.$disconnect();
  }
}

forceCompleteGame(); 