const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixStuckGames() {
  try {
    console.log('Finding stuck games...');
    
    // Find all games stuck in PLAYING status for more than 5 minutes
    const stuckGames = await prisma.game.findMany({
      where: {
        status: 'PLAYING',
        updatedAt: {
          lt: new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });
    
    console.log(`Found ${stuckGames.length} stuck games`);
    
    for (const game of stuckGames) {
      console.log(`Processing game ${game.id}...`);
      
      // Check if this game has rounds and tricks
      const rounds = await prisma.round.findMany({
        where: { gameId: game.id },
        include: {
          tricks: {
            include: {
              cards: true
            }
          }
        },
        orderBy: { roundNumber: 'desc' }
      });
      
      if (rounds.length === 0) {
        console.log(`Game ${game.id} has no rounds - cancelling`);
        await prisma.game.update({
          where: { id: game.id },
          data: {
            status: 'CANCELLED',
            cancelled: true,
            updatedAt: new Date()
          }
        });
        continue;
      }
      
      const latestRound = rounds[0];
      const totalTricks = latestRound.tricks.length;
      
      console.log(`Game ${game.id} has ${rounds.length} rounds, latest round has ${totalTricks} tricks`);
      
      if (totalTricks === 13) {
        // Hand is complete, but game is stuck
        console.log(`Game ${game.id} has completed hand but is stuck - forcing completion`);
        
        // Force complete the game
        await prisma.game.update({
          where: { id: game.id },
          data: {
            status: 'FINISHED',
            completed: true,
            finalScore: game.maxPoints,
            winner: 1, // Default to team 1
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
            totalRounds: rounds.length,
            totalTricks: totalTricks,
            specialEvents: {
              nils: {},
              totalHands: rounds.length
            }
          }
        });
        
        console.log(`Completed game ${game.id}`);
      } else {
        // Hand is incomplete - cancel the game
        console.log(`Game ${game.id} has incomplete hand - cancelling`);
        await prisma.game.update({
          where: { id: game.id },
          data: {
            status: 'CANCELLED',
            cancelled: true,
            updatedAt: new Date()
          }
        });
      }
    }
    
    console.log('All stuck games have been processed!');
    
  } catch (error) {
    console.error('Error fixing stuck games:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixStuckGames(); 