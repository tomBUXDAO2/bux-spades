#!/usr/bin/env node

import { prisma } from './server/src/config/databaseFirst.js';

async function testDatabaseConnection() {
  try {
    console.log('🔌 Testing database connection...');
    
    // Test basic connection
    await prisma.$connect();
    console.log('✅ Database connected');
    
    // Test simple query
    const userCount = await prisma.user.count();
    console.log(`✅ Found ${userCount} users in database`);
    
    // Test game query
    const gameCount = await prisma.game.count();
    console.log(`✅ Found ${gameCount} games in database`);
    
    // Test active games query
    const activeGames = await prisma.game.findMany({
      where: { 
        status: { in: ['WAITING', 'PLAYING'] }
      }
    });
    console.log(`✅ Found ${activeGames.length} active games`);
    
    await prisma.$disconnect();
    console.log('✅ Database disconnected');
    
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

testDatabaseConnection();
