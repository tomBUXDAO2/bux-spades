import { games } from '../src/gamesStore';

function checkGameStore() {
  console.log('🎮 Checking In-Memory Game Store...\n');

  console.log(`📊 Total Games in Memory: ${games.length}\n`);

  if (games.length === 0) {
    console.log('No games found in memory store');
    return;
  }

  games.forEach((game, index) => {
    console.log(`Game ${index + 1}:`);
    console.log(`  ID: ${game.id}`);
    console.log(`  Status: ${game.status}`);
    console.log(`  Mode: ${game.gameMode}`);
    console.log(`  Players: ${game.players.filter(p => p !== null).length}/4`);
    console.log(`  Has DB Game ID: ${game.dbGameId ? 'Yes' : 'No'}`);
    
    if (game.players) {
      console.log('  Player Details:');
      game.players.forEach((player, playerIndex) => {
        if (player) {
          console.log(`    ${playerIndex}: ${player.username} (${player.type})`);
        } else {
          console.log(`    ${playerIndex}: Empty`);
        }
      });
    }

    if (game.bidding) {
      console.log(`  Bidding Phase: Current bidder index ${game.bidding.currentBidderIndex}`);
      console.log(`  Bids: ${game.bidding.bids.map(bid => bid || 'null').join(', ')}`);
    }

    if (game.play) {
      console.log(`  Play Phase: Current player index ${game.play.currentPlayerIndex}`);
      console.log(`  Current Trick: ${game.play.currentTrick.length} cards`);
      console.log(`  Completed Tricks: ${game.play.tricks.length}`);
      console.log(`  Trick Number: ${game.play.trickNumber}`);
    }

    console.log('');
  });
}

// Run the check
checkGameStore(); 