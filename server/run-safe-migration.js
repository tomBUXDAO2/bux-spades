import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://spades_owner:npg_uKzm7BqeL5Iw@ep-holy-truth-abamc73q-pooler.eu-west-2.aws.neon.tech/spades?sslmode=require&channel_binding=require"
    }
  }
});

async function runSafeMigration() {
  try {
    console.log('Running safe migration to add missing columns...');
    
    // Read the SQL file
    const sql = fs.readFileSync('./add-missing-columns.sql', 'utf8');
    
    // Execute the SQL
    const result = await prisma.$executeRawUnsafe(sql);
    
    console.log('Migration completed successfully!');
    console.log('Result:', result);
    
  } catch (error) {
    console.error('Error running migration:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runSafeMigration();
