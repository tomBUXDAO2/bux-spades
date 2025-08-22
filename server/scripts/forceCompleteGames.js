const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function forceCompleteStuckGames() {
  try {
    console.log('Finding stuck games...');
    
    // Find all games stuck in PLAYING status
    const stuckGames = await prisma.game.findMany({
      where: {
        status: 'PLAYING'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    console.log(`Found ${stuckGames.length} stuck games`);
    
    for (const game of stuckGames) {
      console.log(`Processing game ${game.id}...`);
      
      // Update game to FINISHED status
      await prisma.game.update({
        where: { id: game.id },
        data: {
          status: 'FINISHED',
          completed: true,
          finalScore: game.maxPoints,
          winner: 1, // Default to team 1 as winner
          updatedAt: new Date()
        }
      });
      
      // Create GameResult record
      await prisma.gameResult.create({
        data: {
          gameId: game.id,
          winner: 1,
          finalScore: game.maxPoints,
          gameDuration: Math.floor((Date.now() - new Date(game.createdAt).getTime()) / 1000),
          team1Score: game.maxPoints,
          team2Score: 0,
          playerResults: {
            players: []
          },
          totalRounds: 1,
          totalTricks: 13,
          specialEvents: {
            nils: {},
            totalHands: 1
          }
        }
      });
      
      console.log(`Completed game ${game.id}`);
    }
    
    console.log('All stuck games have been force completed!');
    
  } catch (error) {
    console.error('Error force completing games:', error);
  } finally {
    await prisma.$disconnect();
  }
}

forceCompleteStuckGames(); 