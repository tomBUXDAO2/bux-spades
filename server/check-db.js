import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://spades_owner:npg_uKzm7BqeL5Iw@ep-holy-truth-abamc73q-pooler.eu-west-2.aws.neon.tech/spades?sslmode=require&channel_binding=require"
    }
  }
});

async function checkDatabase() {
  try {
    console.log('Checking database structure...');
    
    // Check if User table exists and what columns it has
    const userColumns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'User' 
      ORDER BY ordinal_position;
    `;
    
    console.log('\nUser table columns:');
    console.log(userColumns);
    
    // Check if Game table exists and what columns it has
    const gameColumns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'Game' 
      ORDER BY ordinal_position;
    `;
    
    console.log('\nGame table columns:');
    console.log(gameColumns);
    
    // Check if there are any users
    try {
      const userCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "User";`;
      console.log('\nUser count:', userCount);
    } catch (e) {
      console.log('\nError counting users:', e.message);
    }
    
    // Check if there are any games
    try {
      const gameCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Game";`;
      console.log('\nGame count:', gameCount);
    } catch (e) {
      console.log('\nError counting games:', e.message);
    }
    
  } catch (error) {
    console.error('Error checking database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();
