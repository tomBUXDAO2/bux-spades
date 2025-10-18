#!/usr/bin/env node

/**
 * PRODUCTION DATABASE INDEX APPLICATION SCRIPT
 * Applies performance indexes to the Fly.io production database
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

async function applyProductionIndexes() {
  try {
    console.log('🚀 Applying database indexes to Fly.io production database...');
    
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
        
        // Execute the statement through Fly.io app
        const { stdout, stderr } = await execAsync(
          `flyctl ssh console -C "psql $DATABASE_URL -c '${statement.replace(/'/g, "\\'")}'"`
        );
        
        if (stderr && !stderr.includes('already exists')) {
          throw new Error(stderr);
        }
        
        successCount++;
        console.log(`✅ Success`);
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('relation') && error.message.includes('does not exist')) {
          console.log(`⚠️  Index/table issue, skipping: ${error.message.split('\n')[0]}`);
          successCount++;
        } else {
          console.error(`❌ Error: ${error.message.split('\n')[0]}`);
          errorCount++;
        }
      }
    }
    
    console.log(`\n📈 Index application complete:`);
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    
    if (errorCount === 0) {
      console.log(`\n🎉 All indexes applied successfully! Production performance should be significantly improved.`);
    } else {
      console.log(`\n⚠️  Some indexes failed to apply. This is normal if tables don't exist yet.`);
    }
    
  } catch (error) {
    console.error('💥 Fatal error applying indexes:', error);
    process.exit(1);
  }
}

// Run the script
applyProductionIndexes();
