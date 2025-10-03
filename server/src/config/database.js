import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// NOTE: Removed previous hard guard that forcibly blocked Game.status='FINISHED'.
// Game completion must be allowed so the lifecycle can progress correctly.

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export { prisma };