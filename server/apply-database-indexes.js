#!/usr/bin/env node

/**
 * DATABASE INDEX APPLICATION SCRIPT
 * Applies performance indexes to the database
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function applyDatabaseIndexes() {
  try {
    console.log('🚀 Applying database indexes for performance optimization...');
    
    // Read the SQL file
    const sqlPath = path.join(process.cwd(), 'database-indexes.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Split into individual statements
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📊 Found ${statements.length} index statements to apply`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const statement of statements) {
      try {
        console.log(`⏳ Applying: ${statement.substring(0, 50)}...`);
        await prisma.$executeRawUnsafe(statement);
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
applyDatabaseIndexes();
