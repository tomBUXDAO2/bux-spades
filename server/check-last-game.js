import { prisma } from './src/config/database.js';

async function checkLastGamePerformance() {
  try {
    // Get the most recent finished game
    const lastGame = await prisma.game.findFirst({
      where: {
        status: 'FINISHED',
        finishedAt: {
          not: null
        }
      },
      orderBy: {
        finishedAt: 'desc'
      },
      include: {
        rounds: {
          include: {
            tricks: {
              include: {
                cards: true
              }
            }
          }
        },
        players: {
          include: {
            user: true
          }
        }
      }
    });

    if (!lastGame) {
      console.log('❌ No finished games found');
      await prisma.$disconnect();
      return;
    }

    const startTime = lastGame.startedAt;
    const endTime = lastGame.finishedAt;
    const duration = (endTime - startTime) / 1000 / 60; // minutes

    console.log('🎮 Last Game Performance:');
    console.log('   Game ID:', lastGame.id);
    console.log('   Started:', startTime.toLocaleString());
    console.log('   Finished:', endTime.toLocaleString());
    console.log('   Duration:', duration.toFixed(2), 'minutes');
    console.log('   Mode:', lastGame.mode);
    console.log('   Format:', lastGame.format);
    console.log('   Rounds:', lastGame.rounds.length);
    
    // Calculate average trick time
    let totalTricks = 0;
    lastGame.rounds.forEach(round => {
      totalTricks += round.tricks.length;
    });
    
    const avgTrickTime = (duration * 60) / totalTricks; // seconds per trick
    console.log('   Total Tricks:', totalTricks);
    console.log('   Avg Time per Trick:', avgTrickTime.toFixed(1), 'seconds');
    
    // Check for any performance issues
    console.log('\n📊 Performance Analysis:');
    if (avgTrickTime < 5) {
      console.log('   ✅ Excellent - Very fast gameplay');
    } else if (avgTrickTime < 10) {
      console.log('   ✅ Good - Normal gameplay speed');
    } else if (avgTrickTime < 20) {
      console.log('   ⚠️  Moderate - Slightly slow');
    } else {
      console.log('   ❌ Slow - May have performance issues');
    }
    
    // Player info
    console.log('\n👥 Players:');
    lastGame.players.forEach(p => {
      console.log('   -', p.user?.username || 'Unknown', '(Seat', p.seatIndex + ')');
    });

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

checkLastGamePerformance();

