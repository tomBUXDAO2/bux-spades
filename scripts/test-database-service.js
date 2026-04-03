#!/usr/bin/env node

import { DatabaseGameService } from '../server/src/services/DatabaseGameService.js';

async function testDatabaseService() {
  try {
    console.log('🧪 Testing DatabaseGameService...');
    
    // Test getActiveGames
    console.log('📋 Getting active games...');
    const games = await DatabaseGameService.getActiveGames();
    console.log(`✅ Found ${games.length} active games`);
    
    if (games.length > 0) {
      console.log('📊 First game:', {
        id: games[0].id,
        status: games[0].status,
        players: games[0].players.length
      });
    }
    
  } catch (error) {
    console.error('❌ DatabaseGameService test failed:', error);
    console.error('Stack:', error.stack);
  }
}

testDatabaseService();
