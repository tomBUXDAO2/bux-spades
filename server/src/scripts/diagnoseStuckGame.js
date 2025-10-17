import { prisma } from '../config/databaseFirst.js';

/**
 * Diagnostic script to identify what records are preventing game deletion
 * Usage: node server/src/scripts/diagnoseStuckGame.js <gameId>
 */

async function diagnoseStuckGame(gameId) {
  console.log(`🔍 Diagnosing stuck game: ${gameId}`);
  console.log('=' .repeat(50));

  try {
    // 1. Check if game exists
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        players: true,
        rounds: true,
        result: true,
        EventGame: true
      }
    });

    if (!game) {
      console.log('❌ Game not found in database');
      return;
    }

    console.log(`✅ Game found: ${game.id}`);
    console.log(`   Status: ${game.status}`);
    console.log(`   Is Rated: ${game.isRated}`);
    console.log(`   Created: ${game.createdAt}`);
    console.log(`   Players: ${game.players.length}`);

    // 2. Check game players
    console.log('\n👥 Game Players:');
    for (const player of game.players) {
      console.log(`   - ${player.userId} (seat ${player.seatIndex}, human: ${player.isHuman}, left: ${player.leftAt})`);
    }

    // 3. Check rounds and related data
    console.log('\n🎯 Rounds:');
    for (const round of game.rounds) {
      console.log(`   Round ${round.roundNumber}:`);
      
      // Check tricks
      const tricks = await prisma.trick.findMany({
        where: { roundId: round.id },
        include: { cards: true }
      });
      console.log(`     Tricks: ${tricks.length}`);
      
      for (const trick of tricks) {
        console.log(`       Trick ${trick.trickNumber}: ${trick.cards.length} cards`);
      }

      // Check round hand snapshots
      const snapshots = await prisma.roundHandSnapshot.findMany({
        where: { roundId: round.id }
      });
      console.log(`     Hand Snapshots: ${snapshots.length}`);

      // Check player round stats
      const playerStats = await prisma.playerRoundStats.findMany({
        where: { roundId: round.id }
      });
      console.log(`     Player Stats: ${playerStats.length}`);

      // Check round scores
      const roundScores = await prisma.roundScore.findMany({
        where: { roundId: round.id }
      });
      console.log(`     Round Scores: ${roundScores.length}`);
    }

    // 4. Check for any remaining foreign key references
    console.log('\n🔗 Foreign Key References:');
    
    // Check if any users still reference this game
    const usersInGame = await prisma.user.findMany({
      where: {
        games: {
          some: { gameId }
        }
      }
    });
    console.log(`   Users still referencing game: ${usersInGame.length}`);

    // Check for any remaining trick cards
    const allTrickIds = [];
    for (const round of game.rounds) {
      const tricks = await prisma.trick.findMany({
        where: { roundId: round.id },
        select: { id: true }
      });
      allTrickIds.push(...tricks.map(t => t.id));
    }

    if (allTrickIds.length > 0) {
      const trickCards = await prisma.trickCard.findMany({
        where: { trickId: { in: allTrickIds } }
      });
      console.log(`   Remaining trick cards: ${trickCards.length}`);
    }

    // 5. Check for any other potential blocking records
    console.log('\n🚫 Potential Blocking Records:');
    
    // Check for any remaining round bids (if they exist)
    try {
      const roundBids = await prisma.$queryRaw`
        SELECT COUNT(*) as count FROM "RoundBid" WHERE "roundId" IN (
          SELECT id FROM "Round" WHERE "gameId" = ${gameId}
        )
      `;
      console.log(`   Round Bids: ${roundBids[0]?.count || 0}`);
    } catch (err) {
      console.log(`   Round Bids: Table may not exist`);
    }

    // Check for any remaining player trick counts
    try {
      const playerTrickCounts = await prisma.$queryRaw`
        SELECT COUNT(*) as count FROM "PlayerTrickCount" WHERE "roundId" IN (
          SELECT id FROM "Round" WHERE "gameId" = ${gameId}
        )
      `;
      console.log(`   Player Trick Counts: ${playerTrickCounts[0]?.count || 0}`);
    } catch (err) {
      console.log(`   Player Trick Counts: Table may not exist`);
    }

    // 6. Test deletion order
    console.log('\n🧪 Testing Deletion Order:');
    
    // Try to delete in the correct order
    const rounds = await prisma.round.findMany({
      where: { gameId },
      select: { id: true }
    });
    const roundIds = rounds.map(r => r.id);

    if (roundIds.length > 0) {
      const tricks = await prisma.trick.findMany({
        where: { roundId: { in: roundIds } },
        select: { id: true }
      });
      const trickIds = tricks.map(t => t.id);

      console.log(`   Would delete ${trickIds.length} trick cards`);
      console.log(`   Would delete ${tricks.length} tricks`);
      console.log(`   Would delete ${roundIds.length} rounds`);
    }

    console.log(`   Would delete ${game.players.length} game players`);
    console.log(`   Would delete ${game.result ? 1 : 0} game result`);
    console.log(`   Would delete ${game.EventGame.length} event games`);
    console.log(`   Would delete 1 game`);

    console.log('\n✅ Diagnosis complete!');
    
  } catch (error) {
    console.error('❌ Error during diagnosis:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get game ID from command line arguments
const gameId = process.argv[2];
if (!gameId) {
  console.log('Usage: node diagnoseStuckGame.js <gameId>');
  process.exit(1);
}

diagnoseStuckGame(gameId);
