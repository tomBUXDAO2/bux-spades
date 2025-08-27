import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backupGameData() {
  try {
    console.log('Backing up game data before schema changes...');
    
    // Get all games with the old columns
    const games = await prisma.$queryRaw<any[]>`
      SELECT 
        id,
        "creatorId",
        status,
        "gameMode",
        "bidType",
        "specialRules",
        "minPoints",
        "maxPoints",
        "buyIn",
        "createdAt",
        "updatedAt",
        solo,
        whiz,
        mirror,
        gimmick,
        screamer,
        assassin,
        rated,
        completed,
        cancelled,
        "finalScore",
        winner,
        "gameType",
        "specialRulesApplied",
        league,
        "allowNil",
        "allowBlindNil"
      FROM "Game"
      ORDER BY "createdAt" DESC
    `;
    
    console.log(`Found ${games.length} games to backup`);
    
    // Save to a JSON file
    const fs = require('fs');
    const backupData = {
      timestamp: new Date().toISOString(),
      games: games,
      totalGames: games.length
    };
    
    fs.writeFileSync('game_data_backup.json', JSON.stringify(backupData, null, 2));
    console.log('✅ Game data backed up to game_data_backup.json');
    
    // Also backup game results
    const gameResults = await prisma.gameResult.findMany({
      include: {
        game: true
      }
    });
    
    const resultsBackup = {
      timestamp: new Date().toISOString(),
      gameResults: gameResults,
      totalResults: gameResults.length
    };
    
    fs.writeFileSync('game_results_backup.json', JSON.stringify(resultsBackup, null, 2));
    console.log('✅ Game results backed up to game_results_backup.json');
    
    // Show summary
    console.log('\n📊 Backup Summary:');
    console.log(`Games: ${games.length}`);
    console.log(`Game Results: ${gameResults.length}`);
    console.log('All data preserved in backup files');
    
  } catch (error) {
    console.error('❌ Backup failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

backupGameData(); 