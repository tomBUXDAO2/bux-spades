#!/usr/bin/env node

/**
 * PERFORMANCE MONITORING SCRIPT
 * Monitors database query performance and provides recommendations
 */

import { PrismaClient } from '@prisma/client';
import { PerformanceMonitoringService } from './src/services/PerformanceMonitoringService.js';

const prisma = new PrismaClient();

async function monitorPerformance() {
  try {
    console.log('🔍 Starting performance monitoring...');
    
    // Test common queries with performance tracking
    const testQueries = [
      {
        name: 'getGameWithPlayers',
        query: () => prisma.game.findMany({
          where: { status: 'PLAYING' },
          include: {
            players: {
              include: { user: true }
            }
          }
        })
      },
      {
        name: 'getGameWithRounds',
        query: () => prisma.game.findFirst({
          where: { status: 'PLAYING' },
          include: {
            rounds: {
              include: {
                tricks: {
                  include: { cards: true }
                }
              }
            }
          }
        })
      },
      {
        name: 'getPlayerStats',
        query: () => prisma.playerRoundStats.findMany({
          where: { tricksWon: { gt: 0 } },
          include: { user: true }
        })
      }
    ];
    
    console.log('📊 Running performance tests...');
    
    for (const testQuery of testQueries) {
      try {
        await PerformanceMonitoringService.trackQuery(testQuery.name, testQuery.query);
        console.log(`✅ ${testQuery.name} completed`);
      } catch (error) {
        console.error(`❌ ${testQuery.name} failed:`, error.message);
      }
    }
    
    // Get performance statistics
    const stats = PerformanceMonitoringService.getPerformanceStats();
    console.log('\n📈 Performance Statistics:');
    console.log(`   Total Queries: ${stats.totalQueries}`);
    console.log(`   Average Query Time: ${stats.averageQueryTime}ms`);
    console.log(`   Max Query Time: ${stats.maxQueryTime}ms`);
    console.log(`   Slow Queries: ${stats.slowQueryCount}`);
    
    // Get recommendations
    const recommendations = PerformanceMonitoringService.getPerformanceRecommendations();
    if (recommendations.length > 0) {
      console.log('\n💡 Performance Recommendations:');
      recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec.type}: ${rec.query}`);
        console.log(`      Time: ${rec.time}ms`);
        console.log(`      Suggestion: ${rec.suggestion}`);
      });
    } else {
      console.log('\n🎉 No performance issues detected!');
    }
    
    // Check database connection pool
    console.log('\n🔗 Database Connection Info:');
    console.log(`   Connection URL: ${process.env.DATABASE_URL ? 'Set' : 'Not set'}`);
    
  } catch (error) {
    console.error('💥 Performance monitoring failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the monitoring
monitorPerformance();
