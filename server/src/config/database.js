import { PrismaClient } from '@prisma/client';

// NUCLEAR: Maximum performance database configuration
const prisma = new PrismaClient({
  log: [], // NO LOGGING AT ALL
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  // NUCLEAR: Maximum performance settings
  __internal: {
    engine: {
      binaryTargets: ['native']
    }
  },
  // NUCLEAR: Extreme connection pooling
  connectionLimit: 20,
  poolTimeout: 0,
  connectTimeout: 0,
  queryTimeout: 0,
  // NUCLEAR: Disable all safety checks for speed
  transactionOptions: {
    maxWait: 0,
    timeout: 0,
    isolationLevel: 'ReadCommitted'
  }
});

// NOTE: Removed previous hard guard that forcibly blocked Game.status='FINISHED'.
// Game completion must be allowed so the lifecycle can progress correctly.

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export { prisma };