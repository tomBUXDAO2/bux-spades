import { PrismaClient } from '@prisma/client';

// Ensure a single PrismaClient instance across hot reloads/dev
const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma || new PrismaClient({
  datasources: {
    db: {
      url: process.env.NEW_DATABASE_URL,
    },
  },
  // Optimized logging - only errors in production
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  // Performance optimizations
  errorFormat: 'minimal',
});

// Optimized connection health check - less frequent in production
const healthCheckInterval = process.env.NODE_ENV === 'production' ? 300000 : 30000; // 5 min vs 30 sec

// Add connection health check
export async function checkDatabaseConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DATABASE] Connection healthy');
    }
    return true;
  } catch (error) {
    console.error('[DATABASE] Connection failed:', error);
    return false;
  }
}

// Periodic connection health check - optimized frequency
setInterval(async () => {
  await checkDatabaseConnection();
}, healthCheckInterval);

if (process.env.NODE_ENV !== 'production') {
	globalForPrisma.prisma = prisma;
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma; 