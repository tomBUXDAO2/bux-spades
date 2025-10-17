#!/usr/bin/env node

/**
 * CLI script to diagnose and fix stuck games
 * Usage: node fix-stuck-game.js <gameId> [--force-delete]
 */

import { ForceGameDeletionService } from './server/src/services/ForceGameDeletionService.js';
import { prisma } from './server/src/config/databaseFirst.js';

async function main() {
  const gameId = process.argv[2];
  const forceDelete = process.argv.includes('--force-delete');
  
  if (!gameId) {
    console.log('Usage: node fix-stuck-game.js <gameId> [--force-delete]');
    console.log('');
    console.log('Examples:');
    console.log('  node fix-stuck-game.js clr1234567890  # Diagnose only');
    console.log('  node fix-stuck-game.js clr1234567890 --force-delete  # Diagnose and force delete');
    process.exit(1);
  }

  console.log(`🔍 Diagnosing stuck game: ${gameId}`);
  console.log('=' .repeat(50));

  try {
    // Step 1: Get detailed game information
    console.log('\n📊 Getting game details...');
    const details = await ForceGameDeletionService.getGameDetails(gameId);
    
    if (!details.found) {
      console.log('❌ Game not found in database');
      process.exit(1);
    }

    console.log('✅ Game found!');
    console.log(`   Status: ${details.game.status}`);
    console.log(`   Is Rated: ${details.game.isRated}`);
    console.log(`   Created: ${details.game.createdAt}`);
    console.log(`   Human Players: ${details.recordCounts.players}`);

    console.log('\n📈 Record counts:');
    Object.entries(details.recordCounts).forEach(([key, count]) => {
      console.log(`   ${key}: ${count}`);
    });

    // Step 2: Check for stuck games
    console.log('\n🔍 Checking for other stuck games...');
    const stuckGames = await ForceGameDeletionService.findStuckGames();
    console.log(`Found ${stuckGames.length} potentially stuck games:`);
    stuckGames.forEach(game => {
      console.log(`   - ${game.id} (${game.status}, ${game.humanPlayers}/${game.totalPlayers} players)`);
    });

    // Step 3: Force delete if requested
    if (forceDelete) {
      console.log('\n🗑️  Force deleting game...');
      const result = await ForceGameDeletionService.forceDeleteGame(gameId);
      
      if (result.success) {
        console.log('✅ Successfully force deleted game!');
        console.log('Steps performed:');
        result.steps.forEach(step => {
          console.log(`   - ${step}`);
        });
      } else {
        console.log('❌ Failed to force delete game:');
        console.log(`   Error: ${result.error}`);
        process.exit(1);
      }
    } else {
      console.log('\n💡 To force delete this game, run:');
      console.log(`   node fix-stuck-game.js ${gameId} --force-delete`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
