import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function forceCompleteMissingGames() {
  try {
    console.log('Starting to force complete games missing GameResult records...');

    // Get all finished games that don't have GameResult records
    const finishedGames = await prisma.game.findMany({
      where: {
        status: 'FINISHED',
        GameResult: null
      },
      include: {
        GamePlayer: true
      }
    });

    console.log(`Found ${finishedGames.length} finished games without GameResult records`);

    let completedCount = 0;
    let skippedCount = 0;

    for (const game of finishedGames) {
      console.log(`Processing game ${game.id} - Mode: ${game.gameMode}`);

      // Determine winner based on GamePlayer records
      let winner = 0;
      let finalScore = 0;

      if (game.gameMode === 'PARTNERS') {
        // Partners mode - determine winning team based on GamePlayer scores
        const team1Players = game.GamePlayer.filter(gp => gp.position === 0 || gp.position === 2);
        const team2Players = game.GamePlayer.filter(gp => gp.position === 1 || gp.position === 3);
        
        const team1Score = team1Players.reduce((sum, p) => sum + (p.finalScore || 0), 0);
        const team2Score = team2Players.reduce((sum, p) => sum + (p.finalScore || 0), 0);
        
        if (team1Score > team2Score) {
          winner = 1; // Team 1 wins
          finalScore = team1Score;
        } else {
          winner = 2; // Team 2 wins
          finalScore = team2Score;
        }
      } else {
        // Solo mode - find player with highest score
        let highestScore = -1;
        for (let i = 0; i < 4; i++) {
          const player = game.GamePlayer.find(gp => gp.position === i);
          if (player && (player.finalScore || 0) > highestScore) {
            highestScore = player.finalScore || 0;
            winner = i;
          }
        }
        finalScore = highestScore;
      }

      console.log(`  Determined winner: ${winner}, final score: ${finalScore}`);

      // Create GameResult record
      await prisma.gameResult.create({
        data: {
          id: `result_${game.id}_${Date.now()}`,
          gameId: game.id,
          winner: winner,
          finalScore: finalScore,
          gameDuration: 0, // We don't have this data
          team1Score: 0, // We'll calculate this from GamePlayer records
          team2Score: 0, // We'll calculate this from GamePlayer records
          playerResults: {}, // Empty for now
          totalRounds: 1, // Assume 1 round
          totalTricks: 13, // Assume 13 tricks
          specialEvents: {}, // Empty for now
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      console.log(`  Created GameResult record for game ${game.id}`);
      completedCount++;
    }

    console.log('\n=== FORCE COMPLETE SUMMARY ===');
    console.log(`Total games processed: ${finishedGames.length}`);
    console.log(`Games completed: ${completedCount}`);
    console.log(`Games skipped: ${skippedCount}`);

    // Verify the fix
    const totalFinishedGames = await prisma.game.count({
      where: { status: 'FINISHED' }
    });

    const gamesWithResults = await prisma.game.count({
      where: {
        status: 'FINISHED',
        GameResult: { isNot: null }
      }
    });

    console.log(`\nVerification:`);
    console.log(`Total finished games: ${totalFinishedGames}`);
    console.log(`Games with GameResult: ${gamesWithResults}`);

  } catch (error) {
    console.error('Error force completing games:', error);
  } finally {
    await prisma.$disconnect();
  }
}

forceCompleteMissingGames(); 