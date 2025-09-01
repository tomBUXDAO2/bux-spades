import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgresql://spades_owner:npg_uKzm7BqeL5Iw@ep-withered-fire-ab21hp42-pooler.eu-west-2.aws.neon.tech/spades?sslmode=require&channel_binding=require'
});

async function fixGamePlayerData() {
  try {
    console.log('Starting to fix GamePlayer data...');
    
    // Get all finished games with GameResult but missing GamePlayer data
    const gamesWithResults = await pool.query(`
      SELECT gr.id as result_id, gr."gameId", gr."playerResults", g.status
      FROM "GameResult" gr
      JOIN "Game" g ON gr."gameId" = g.id
      ORDER BY gr."createdAt" DESC
    `);
    
    console.log(`Found ${gamesWithResults.rows.length} games with results`);
    
    for (const gameResult of gamesWithResults.rows) {
      const gameId = gameResult.gameId;
      const status = gameResult.status;
      
      console.log(`\nProcessing game ${gameId} (${status})`);
      
      // Get GamePlayer records for this game
      const gamePlayers = await pool.query(`
        SELECT id, username, position, "finalScore", won, "finalBags", "finalPoints", bid, team
        FROM "GamePlayer" 
        WHERE "gameId" = $1 
        ORDER BY position
      `, [gameId]);
      
      console.log(`GamePlayer count: ${gamePlayers.rows.length}`);
      
      // Check if any GamePlayer records are missing data
      const incompletePlayers = gamePlayers.rows.filter((gp: any) => 
        gp.finalScore === null || 
        gp.won === null || 
        gp.finalBags === null || 
        gp.finalPoints === null
      );
      
      if (incompletePlayers.length === 0) {
        console.log(`✅ Game ${gameId} has complete GamePlayer data`);
        continue;
      }
      
      console.log(`❌ Game ${gameId} has ${incompletePlayers.length} incomplete GamePlayer records`);
      
      // Parse player results from GameResult
      const playerResults = gameResult.playerResults;
      if (!playerResults || !playerResults.players) {
        console.log(`⚠️ No player results found for game ${gameId}`);
        continue;
      }
      
      // Update each GamePlayer record
      for (const gamePlayer of gamePlayers.rows) {
        const playerResult = playerResults.players.find((pr: any) => pr.position === gamePlayer.position);
        
        if (!playerResult) {
          console.log(`⚠️ No player result found for position ${gamePlayer.position} in game ${gameId}`);
          continue;
        }
        
        // Update the GamePlayer record
        await pool.query(`
          UPDATE "GamePlayer" 
          SET "finalScore" = $1, won = $2, "finalBags" = $3, "finalPoints" = $4, bid = $5, team = $6, "updatedAt" = NOW()
          WHERE id = $7
        `, [
          playerResult.finalScore || 0,
          playerResult.won || false,
          playerResult.finalBags || 0,
          playerResult.finalScore || 0,
          playerResult.finalBid || 0,
          playerResult.team || null,
          gamePlayer.id
        ]);
        
        console.log(`✅ Updated GamePlayer ${gamePlayer.id} (${gamePlayer.username}) at position ${gamePlayer.position}`);
        console.log(`   finalScore: ${playerResult.finalScore}, won: ${playerResult.won}, finalBags: ${playerResult.finalBags}`);
      }
    }
    
    console.log('\n✅ Finished fixing GamePlayer data');
    
  } catch (error) {
    console.error('Error fixing GamePlayer data:', error);
  } finally {
    await pool.end();
  }
}

fixGamePlayerData(); 