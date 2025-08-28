const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://spades_owner:npg_uKzm7BqeL5Iw@ep-withered-fire-ab21hp42-pooler.eu-west-2.aws.neon.tech/spades?sslmode=require&channel_binding=require"
    }
  }
});

async function checkGames() {
  try {
    console.log('=== CHECKING RECENT GAMES ===');

    // Check recent games
    const recentGames = await prisma.game.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        GamePlayer: true,
        GameResult: true,
        Round: {
          include: {
            Trick: {
              include: {
                Card: true
              }
            }
          }
        }
      }
    });

    console.log(`Found ${recentGames.length} recent games:`);

    recentGames.forEach((game, index) => {
      console.log(`\n--- Game ${index + 1} ---`);
      console.log(`ID: ${game.id}`);
      console.log(`Created: ${game.createdAt}`);
      console.log(`Status: ${game.status}`);
      console.log(`Players: ${game.GamePlayer.length}`);
      console.log(`Rounds: ${game.Round.length}`);
      console.log(`Has Result: ${game.GameResult ? 'YES' : 'NO'}`);

      if (game.GameResult) {
        console.log(`Result Winner: ${game.GameResult.winner}`);
        console.log(`Result Final Score: ${game.GameResult.finalScore}`);
      }

      // Check total tricks
      let totalTricks = 0;
      game.Round.forEach(round => {
        totalTricks += round.Trick.length;
      });
      console.log(`Total Tricks: ${totalTricks}`);
    });

    // Check if any games are missing results
    const gamesWithoutResults = await prisma.game.findMany({
      where: {
        status: 'FINISHED',
        GameResult: null
      },
      include: {
        GamePlayer: true,
        Round: {
          include: {
            Trick: {
              include: {
                Card: true
              }
            }
          }
        }
      }
    });

    console.log(`\n=== GAMES WITHOUT RESULTS: ${gamesWithoutResults.length} ===`);

    gamesWithoutResults.forEach((game, index) => {
      console.log(`\n--- Game Without Result ${index + 1} ---`);
      console.log(`ID: ${game.id}`);
      console.log(`Created: ${game.createdAt}`);
      console.log(`Players: ${game.GamePlayer.length}`);
      console.log(`Rounds: ${game.Round.length}`);

      // Check total tricks
      let totalTricks = 0;
      game.Round.forEach(round => {
        totalTricks += round.Trick.length;
      });
      console.log(`Total Tricks: ${totalTricks}`);
    });

    // Check users with Discord IDs
    const usersWithDiscord = await prisma.user.findMany({
      where: {
        discordId: { not: null }
      },
      select: {
        id: true,
        username: true,
        discordId: true
      }
    });

    console.log(`\n=== USERS WITH DISCORD IDs: ${usersWithDiscord.length} ===`);
    usersWithDiscord.forEach(user => {
      console.log(`${user.username} (${user.discordId})`);
    });

    // NEW: Check all tables separately
    console.log('\n=== CHECKING ALL TABLES ===');

    const allGames = await prisma.game.findMany();
    console.log(`Total Games: ${allGames.length}`);

    const allRounds = await prisma.round.findMany();
    console.log(`Total Rounds: ${allRounds.length}`);

    const allTricks = await prisma.trick.findMany();
    console.log(`Total Tricks: ${allTricks.length}`);

    const allCards = await prisma.card.findMany();
    console.log(`Total Cards: ${allCards.length}`);

    const allGamePlayers = await prisma.gamePlayer.findMany();
    console.log(`Total Game Players: ${allGamePlayers.length}`);

    const allGameResults = await prisma.gameResult.findMany();
    console.log(`Total Game Results: ${allGameResults.length}`);

    // Show recent activity in each table
    if (allGames.length > 0) {
      console.log('\n=== MOST RECENT GAME ===');
      const latestGame = allGames[allGames.length - 1];
      console.log(`ID: ${latestGame.id}`);
      console.log(`Status: ${latestGame.status}`);
      console.log(`Created: ${latestGame.createdAt}`);
    }

    if (allRounds.length > 0) {
      console.log('\n=== MOST RECENT ROUND ===');
      const latestRound = allRounds[allRounds.length - 1];
      console.log(`ID: ${latestRound.id}`);
      console.log(`Game ID: ${latestRound.gameId}`);
      console.log(`Round Number: ${latestRound.roundNumber}`);
      console.log(`Created: ${latestRound.createdAt}`);
    }

    if (allTricks.length > 0) {
      console.log('\n=== MOST RECENT TRICK ===');
      const latestTrick = allTricks[allTricks.length - 1];
      console.log(`ID: ${latestTrick.id}`);
      console.log(`Round ID: ${latestTrick.roundId}`);
      console.log(`Trick Number: ${latestTrick.trickNumber}`);
      console.log(`Created: ${latestTrick.createdAt}`);
    }

    if (allCards.length > 0) {
      console.log('\n=== MOST RECENT CARD ===');
      const latestCard = allCards[allCards.length - 1];
      console.log(`ID: ${latestCard.id}`);
      console.log(`Trick ID: ${latestCard.trickId}`);
      console.log(`Suit: ${latestCard.suit}, Value: ${latestCard.value}`);
      console.log(`Created: ${latestCard.createdAt}`);
    }

  } catch (error) {
    console.error('Error checking games:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkGames(); 