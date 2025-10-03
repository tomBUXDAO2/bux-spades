import { PrismaClient } from '@prisma/client';

/**
 * DATABASE-FIRST DATABASE CONFIGURATION
 * No hard guards - database is the single source of truth
 */
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

export { prisma };
