import { PrismaClient } from '../../node_modules/.prisma/new-client';

// Uses NEW_DATABASE_URL from server/.env via the new schema's datasource
export const prismaNew = new PrismaClient();
 
export async function ensureNewDbConnection(): Promise<void> {
	// Simple health check; throws if NEW_DATABASE_URL is misconfigured
	await prismaNew.$queryRaw`SELECT 1`;
} 