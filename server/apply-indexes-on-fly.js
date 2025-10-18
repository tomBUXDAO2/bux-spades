#!/usr/bin/env node

/**
 * DATABASE INDEX APPLICATION SCRIPT FOR FLY.IO
 * This script should be run directly on the Fly.io app
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function applyIndexes() {
  try {
    console.log('🚀 Applying database indexes for performance optimization...');
    
    // Critical indexes for performance
    const indexes = [
      // Trick indexes (most critical)
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trick_roundid_tricknumber ON "Trick"("roundId", "trickNumber")',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trick_roundid_winningseat ON "Trick"("roundId", "winningSeatIndex")',
      
      // TrickCard indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trickcard_trickid_playorder ON "TrickCard"("trickId", "playOrder")',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trickcard_trickid_seatindex ON "TrickCard"("trickId", "seatIndex")',
      
      // PlayerRoundStats indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_playerroundstats_roundid_seatindex ON "PlayerRoundStats"("roundId", "seatIndex")',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_playerroundstats_roundid_teamindex ON "PlayerRoundStats"("roundId", "teamIndex")',
      
      // Round indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_round_gameid_roundnumber ON "Round"("gameId", "roundNumber")',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_round_gameid_dealerseat ON "Round"("gameId", "dealerSeatIndex")',
      
      // GamePlayer indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gameplayer_gameid_seatindex ON "GamePlayer"("gameId", "seatIndex")',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gameplayer_gameid_userid ON "GamePlayer"("gameId", "userId")',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gameplayer_gameid_teamindex ON "GamePlayer"("gameId", "teamIndex")',
      
      // Game indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_game_status ON "Game"("status")',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_game_createdat ON "Game"("createdAt")',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_game_isleague ON "Game"("isLeague")',
      
      // User indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_username ON "User"("username")',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_discordid ON "User"("discordId")',
      
      // RoundScore indexes
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_roundscore_roundid ON "RoundScore"("roundId")',
      
      // Composite indexes for complex queries
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trick_complete ON "Trick"("roundId", "trickNumber", "winningSeatIndex")',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_playerstats_complete ON "PlayerRoundStats"("roundId", "seatIndex", "tricksWon")',
      
      // Partial indexes for active games
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_game_active ON "Game"("status") WHERE "status" IN (\'WAITING\', \'BIDDING\', \'PLAYING\')'
    ];
    
    console.log(`📊 Found ${indexes.length} index statements to apply`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const indexSql of indexes) {
      try {
        console.log(`⏳ Applying: ${indexSql.substring(0, 50)}...`);
        await prisma.$executeRawUnsafe(indexSql);
        successCount++;
        console.log(`✅ Success`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`⚠️  Index already exists, skipping`);
          successCount++;
        } else {
          console.error(`❌ Error: ${error.message}`);
          errorCount++;
        }
      }
    }
    
    // Analyze tables to update statistics
    const tables = ['Game', 'GamePlayer', 'Round', 'Trick', 'TrickCard', 'PlayerRoundStats', 'RoundScore', 'User'];
    
    for (const table of tables) {
      try {
        console.log(`⏳ Analyzing table: ${table}...`);
        await prisma.$executeRawUnsafe(`ANALYZE "${table}"`);
        console.log(`✅ ${table} analyzed`);
      } catch (error) {
        console.error(`❌ Error analyzing ${table}: ${error.message}`);
      }
    }
    
    console.log(`\n📈 Index application complete:`);
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    
    if (errorCount === 0) {
      console.log(`\n🎉 All indexes applied successfully! Performance should be significantly improved.`);
    } else {
      console.log(`\n⚠️  Some indexes failed to apply. Check the errors above.`);
    }
    
  } catch (error) {
    console.error('💥 Fatal error applying indexes:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
applyIndexes();
