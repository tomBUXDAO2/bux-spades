import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixMissingGameResults() {
  try {
    console.log('Starting to fix missing game results...');

    // Get all finished games that don't have proper winner data
    const finishedGames = await prisma.game.findMany({
      where: {
        status: 'FINISHED'
      },
      include: {
        GamePlayer: true,
        GameResult: true
      }
    });

    console.log(`Found ${finishedGames.length} finished games`);

    let fixedCount = 0;
    let skippedCount = 0;

    for (const game of finishedGames) {
      // Check if this game already has proper winner data
      const hasWinners = game.GamePlayer.some(gp => gp.won !== null);
      
      if (hasWinners) {
        console.log(`Game ${game.id} already has winners, skipping`);
        skippedCount++;
        continue;
      }

      // Check if we have GameResult data
      if (!game.GameResult) {
        console.log(`Game ${game.id} has no GameResult, skipping`);
        skippedCount++;
        continue;
      }

      const gameResult = game.GameResult;
      const winner = gameResult.winner; // This should be the winning team/player position

      console.log(`Fixing game ${game.id} - winner: ${winner}`);

      // Update all GamePlayer records for this game
      for (const gamePlayer of game.GamePlayer) {
        let isWinner = false;

        if (game.gameMode === 'PARTNERS') {
          // Partners mode: winner is team (0,2 or 1,3)
          isWinner = (winner === 1 && (gamePlayer.position === 0 || gamePlayer.position === 2)) ||
                    (winner === 2 && (gamePlayer.position === 1 || gamePlayer.position === 3));
        } else {
          // Solo mode: winner is individual player
          isWinner = gamePlayer.position === winner;
        }

        // Update the GamePlayer record
        await prisma.gamePlayer.update({
          where: { id: gamePlayer.id },
          data: {
            won: isWinner,
            finalScore: gameResult.finalScore || 0,
            finalBags: gamePlayer.bags || 0,
            finalPoints: gameResult.finalScore || 0
          }
        });

        console.log(`  Player ${gamePlayer.userId} (position ${gamePlayer.position}): won=${isWinner}`);
      }

      fixedCount++;
    }

    console.log('\n=== GAME RESULTS FIX SUMMARY ===');
    console.log(`Total finished games: ${finishedGames.length}`);
    console.log(`Games already had winners: ${skippedCount}`);
    console.log(`Games fixed: ${fixedCount}`);

    // Verify the fix
    const totalFinishedGames = await prisma.game.count({
      where: { status: 'FINISHED' }
    });

    const gamesWithWinners = await prisma.game.count({
      where: {
        status: 'FINISHED',
        GamePlayer: {
          some: {
            won: { not: null }
          }
        }
      }
    });

    console.log(`\nVerification:`);
    console.log(`Total finished games: ${totalFinishedGames}`);
    console.log(`Games with winners: ${gamesWithWinners}`);

  } catch (error) {
    console.error('Error fixing game results:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixMissingGameResults(); 