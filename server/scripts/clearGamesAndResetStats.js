// Safe reset script: clears game-related tables and resets stats/coins
// Preserves: User, Friend, BlockedUser
// Requires DATABASE_URL environment variable

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting safe reset (preserve users/friends/blocked)...');
  console.log('Using DATABASE_URL:', process.env.DATABASE_URL ? 'provided' : 'MISSING');

  try {
    // Show counts before
    const countsBefore = await getCounts();
    console.log('Counts before:', countsBefore);

    // Clear game-related tables in child-to-parent order
    console.log('Deleting Cards...');
    await prisma.card.deleteMany({});

    console.log('Deleting Tricks...');
    await prisma.trick.deleteMany({});

    console.log('Deleting Rounds...');
    await prisma.round.deleteMany({});

    console.log('Deleting GameResults...');
    await prisma.gameResult.deleteMany({});

    console.log('Deleting GamePlayers...');
    await prisma.gamePlayer.deleteMany({});

    console.log('Deleting Games...');
    await prisma.game.deleteMany({});

    // Reset stats
    console.log('Resetting UserStats to zero...');
    await prisma.userStats.updateMany({
      data: {
        gamesPlayed: 0,
        gamesWon: 0,
        nilsBid: 0,
        nilsMade: 0,
        blindNilsBid: 0,
        blindNilsMade: 0,
        totalBags: 0,
        bagsPerGame: 0,
        partnersGamesPlayed: 0,
        partnersGamesWon: 0,
        partnersTotalBags: 0,
        partnersBagsPerGame: 0,
        soloGamesPlayed: 0,
        soloGamesWon: 0,
        soloTotalBags: 0,
        soloBagsPerGame: 0,
        totalCoinsWon: 0,
        totalCoinsLost: 0,
        netCoins: 0
      }
    });

    // Reset coins
    console.log('Resetting all user coins to 5,000,000...');
    await prisma.user.updateMany({ data: { coins: 5_000_000 } });

    const countsAfter = await getCounts();
    console.log('Counts after:', countsAfter);
    console.log('Safe reset completed.');
  } catch (err) {
    console.error('Safe reset failed:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

async function getCounts() {
  const [users, userStats, games, gamePlayers, gameResults, rounds, tricks, cards, friends, blocked] = await Promise.all([
    prisma.user.count(),
    prisma.userStats.count(),
    prisma.game.count(),
    prisma.gamePlayer.count(),
    prisma.gameResult.count(),
    prisma.round.count(),
    prisma.trick.count(),
    prisma.card.count(),
    prisma.friend.count(),
    prisma.blockedUser.count(),
  ]);
  return { users, userStats, games, gamePlayers, gameResults, rounds, tricks, cards, friends, blocked };
}

main(); 