import { PrismaClient } from '@prisma/client';

// EMERGENCY: Remove all logging in production
const isDev = process.env.NODE_ENV === 'development';
const prisma = new PrismaClient({
  log: isDev ? ['query', 'info', 'warn', 'error'] : [],
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  // EMERGENCY: Optimize for production performance
  __internal: {
    engine: {
      binaryTargets: ['native']
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