import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function safeSchemaMigration() {
  try {
    console.log('Starting safe schema migration...');
    
    // Step 1: Create a temporary table to store the old game data
    console.log('Step 1: Creating temporary backup table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "GameBackup" (
        id TEXT PRIMARY KEY,
        "creatorId" TEXT NOT NULL,
        status TEXT NOT NULL,
        "gameMode" TEXT NOT NULL,
        "bidType" TEXT NOT NULL,
        "specialRules" TEXT[] NOT NULL,
        "minPoints" INTEGER NOT NULL,
        "maxPoints" INTEGER NOT NULL,
        "buyIn" INTEGER NOT NULL,
        "createdAt" TIMESTAMP NOT NULL,
        "updatedAt" TIMESTAMP NOT NULL,
        solo BOOLEAN,
        whiz BOOLEAN,
        mirror BOOLEAN,
        gimmick BOOLEAN,
        screamer BOOLEAN,
        assassin BOOLEAN,
        rated BOOLEAN,
        completed BOOLEAN,
        cancelled BOOLEAN,
        "finalScore" INTEGER,
        winner INTEGER,
        "gameType" TEXT,
        "specialRulesApplied" TEXT[],
        league BOOLEAN,
        "allowNil" BOOLEAN,
        "allowBlindNil" BOOLEAN
      )
    `;
    
    // Step 2: Copy all game data to the backup table
    console.log('Step 2: Copying game data to backup table...');
    await prisma.$executeRaw`
      INSERT INTO "GameBackup" 
      SELECT * FROM "Game"
      ON CONFLICT (id) DO NOTHING
    `;
    
    console.log('✅ Game data safely backed up to temporary table');
    
    // Step 3: Now we can safely apply the schema changes
    console.log('Step 3: Schema is now safe to update');
    console.log('You can now run: npx prisma db push');
    console.log('The old data is preserved in the GameBackup table');
    
    // Step 4: Show what data we preserved
    const backupCount = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "GameBackup"
    `;
    
    console.log(`✅ Preserved ${backupCount[0].count} games in backup table`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

safeSchemaMigration(); 