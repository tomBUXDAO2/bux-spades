import { PrismaClient } from '@prisma/client';

// NUCLEAR: Remove ALL logging for maximum performance
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
  }
});

// NOTE: Removed previous hard guard that forcibly blocked Game.status='FINISHED'.
// Game completion must be allowed so the lifecycle can progress correctly.

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export { prisma };