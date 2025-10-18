import { PrismaClient } from '@prisma/client';

// OPTIMIZED: High-performance database configuration with connection pooling
const prisma = new PrismaClient({
  log: [], // NO LOGGING AT ALL
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  // OPTIMIZED: Connection pooling and performance settings
  __internal: {
    engine: {
      binaryTargets: ['native'],
      connectionLimit: 20,
      poolTimeout: 20000,
      queryTimeout: 10000
    }
  }
});

// NOTE: Removed previous hard guard that forcibly blocked Game.status='FINISHED'.
// Game completion must be allowed so the lifecycle can progress correctly.

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export { prisma };