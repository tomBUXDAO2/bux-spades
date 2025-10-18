import { PrismaClient } from '@prisma/client';

/**
 * DATABASE-FIRST DATABASE CONFIGURATION
 * No hard guards - database is the single source of truth
 */
const prisma = new PrismaClient({
  log: [], // NO LOGGING IN PRODUCTION - PERFORMANCE CRITICAL
});

export { prisma };
