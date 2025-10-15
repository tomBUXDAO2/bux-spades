import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupPhantomRounds() {
  try {
    console.log('=== CLEANING UP PHANTOM ROUNDS ===\n');
    
    // Find all rounds with PlayerRoundStats that have NULL bids
    const phantomStats = await prisma.playerRoundStats.findMany({
      where: {
        bid: null
      },
      include: {
        round: {
          include: {
            game: {
              select: {
                id: true,
                status: true,
                currentRound: true
              }
            }
          }
        }
      },
      orderBy: [
        { round: { gameId: 'asc' } },
        { round: { roundNumber: 'asc' } }
      ]
    });
    
    console.log(`Found ${phantomStats.length} PlayerRoundStats with NULL bids\n`);
    
    // Group by game and round
    const byGame = {};
    for (const stat of phantomStats) {
      const gameId = stat.round.gameId;
      const roundNumber = stat.round.roundNumber;
      
      if (!byGame[gameId]) {
        byGame[gameId] = {
          game: stat.round.game,
          rounds: {}
        };
      }
      
      if (!byGame[gameId].rounds[roundNumber]) {
        byGame[gameId].rounds[roundNumber] = {
          roundId: stat.roundId,
          stats: []
        };
      }
      
      byGame[gameId].rounds[roundNumber].stats.push(stat);
    }
    
    // Display phantom rounds by game
    for (const [gameId, data] of Object.entries(byGame)) {
      console.log(`Game: ${gameId} (status: ${data.game.status}, currentRound: ${data.game.currentRound})`);
      console.log(`  Phantom rounds: ${Object.keys(data.rounds).join(', ')}`);
      
      for (const [roundNumber, roundData] of Object.entries(data.rounds)) {
        console.log(`    Round ${roundNumber}: ${roundData.stats.length} players with NULL bids`);
      }
      console.log();
    }
    
    // Ask for confirmation (in production, you might want to skip this)
    console.log('Would delete the following:');
    let totalStats = 0;
    let totalRounds = 0;
    
    for (const data of Object.values(byGame)) {
      for (const roundData of Object.values(data.rounds)) {
        totalStats += roundData.stats.length;
        totalRounds++;
      }
    }
    
    console.log(`  ${totalStats} PlayerRoundStats records`);
    console.log(`  ${totalRounds} Round records`);
    console.log(`  From ${Object.keys(byGame).length} games`);
    console.log('\nTo actually delete, uncomment the deletion code in the script.');
    
    // UNCOMMENT TO ACTUALLY DELETE:
    /*
    console.log('\nDeleting phantom rounds...');
    
    for (const [gameId, data] of Object.entries(byGame)) {
      for (const [roundNumber, roundData] of Object.entries(data.rounds)) {
        console.log(`  Deleting round ${roundNumber} from game ${gameId}`);
        
        // Delete PlayerRoundStats first
        await prisma.playerRoundStats.deleteMany({
          where: {
            roundId: roundData.roundId
          }
        });
        
        // Delete RoundHandSnapshots
        await prisma.roundHandSnapshot.deleteMany({
          where: {
            roundId: roundData.roundId
          }
        });
        
        // Delete the Round itself
        await prisma.round.delete({
          where: {
            id: roundData.roundId
          }
        });
        
        console.log(`    Deleted round ${roundNumber} (${roundData.roundId})`);
      }
    }
    
    console.log('\nCleanup complete!');
    */
    
  } catch (error) {
    console.error('Error cleaning up phantom rounds:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupPhantomRounds();

