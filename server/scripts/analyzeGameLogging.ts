import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeGameLogging() {
  try {
    // Get the most recent completed game
    const game = await prisma.game.findFirst({
      where: {
        status: 'FINISHED',
        league: true
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    if (!game) {
      console.log('No completed league games found');
      return;
    }

    console.log('=== GAME ANALYSIS ===');
    console.log(`Game ID: ${game.id}`);
    console.log(`Status: ${game.status}`);
    console.log(`League: ${game.league}`);
    console.log(`Created: ${game.createdAt}`);
    console.log(`Updated: ${game.updatedAt}`);
    console.log(`Final Score: ${game.finalScore}`);
    console.log(`Winner: ${game.winner}`);
    console.log('');

    // Get players
    const players = await prisma.gamePlayer.findMany({
      where: { gameId: game.id },
      orderBy: { position: 'asc' }
    });

    console.log('=== PLAYERS ===');
    players.forEach((player, i) => {
      console.log(`Position ${i}: ${player.username} (Team ${player.team}) - Bid: ${player.bid}, Bags: ${player.bags}, Won: ${player.won}`);
    });
    console.log('');

    // Get rounds
    const rounds = await prisma.round.findMany({
      where: { gameId: game.id },
      orderBy: { roundNumber: 'asc' }
    });

    console.log('=== ROUNDS ===');
    console.log(`Total rounds: ${rounds.length}`);
    rounds.forEach(round => {
      console.log(`Round ${round.roundNumber}: Created ${round.createdAt}`);
    });
    console.log('');

    // Get tricks for each round
    for (const round of rounds) {
      console.log(`=== ROUND ${round.roundNumber} TRICKS ===`);
      
      const tricks = await prisma.trick.findMany({
        where: { roundId: round.id },
        orderBy: { trickNumber: 'asc' }
      });

      console.log(`Total tricks in round: ${tricks.length}`);

      for (const trick of tricks) {
        console.log(`\n--- Trick ${trick.trickNumber} ---`);
        console.log(`Lead Player: ${trick.leadPlayerId}`);
        console.log(`Winning Player: ${trick.winningPlayerId}`);
        
        // Get cards played in this trick
        const cards = await prisma.card.findMany({
          where: { trickId: trick.id },
          orderBy: { position: 'asc' }
        });

        console.log('Cards played:');
        for (const card of cards) {
          const player = players.find(p => p.userId === card.playerId);
          const playerName = player ? player.username : 'Unknown';
          console.log(`  Position ${card.position}: ${playerName} - ${card.suit} ${card.value}`);
        }

        // Check for duplicates
        const cardCounts = cards.reduce((acc, card) => {
          const key = `${card.playerId}-${card.suit}-${card.value}-${card.position}`;
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const duplicates = Object.entries(cardCounts).filter(([_, count]) => count > 1);
        if (duplicates.length > 0) {
          console.log('⚠️  DUPLICATE CARDS FOUND:');
          duplicates.forEach(([key, count]) => {
            console.log(`    ${key}: ${count} times`);
          });
        }
      }
    }

    // Check if GameResult exists
    const gameResult = await prisma.gameResult.findFirst({
      where: { gameId: game.id }
    });

    console.log('\n=== GAME RESULT ===');
    if (gameResult) {
      console.log('✅ GameResult exists');
      console.log(`Winner: ${gameResult.winner}`);
      console.log(`Final Score: ${gameResult.finalScore}`);
      console.log(`Team 1 Score: ${gameResult.team1Score}`);
      console.log(`Team 2 Score: ${gameResult.team2Score}`);
      console.log(`Total Rounds: ${gameResult.totalRounds}`);
      console.log(`Total Tricks: ${gameResult.totalTricks}`);
      console.log(`Game Duration: ${gameResult.gameDuration}s`);
    } else {
      console.log('❌ NO GAME RESULT FOUND - This is why Discord embed failed!');
    }

  } catch (error) {
    console.error('Error analyzing game logging:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeGameLogging(); 