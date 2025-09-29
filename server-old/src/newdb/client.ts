import { PrismaClient } from '../../node_modules/.prisma/new-client';

// Uses NEW_DATABASE_URL from server/.env via the new schema's datasource
export const prismaNew = new PrismaClient();

// Add middleware to log ALL status updates to FINISHED
prismaNew.$use(async (params, next) => {
  if (params.model === 'Game' && params.action === 'update') {
    const args = params.args as any;
    if (args?.data?.status === 'FINISHED') {
      console.log(`🚨 [NEWDB PRISMA] Setting game ${args.where?.id} to FINISHED!`);
      console.log(`🚨 [NEWDB PRISMA] Stack trace:`, new Error().stack);
      console.log(`🚨 [NEWDB PRISMA] Args:`, JSON.stringify(args, null, 2));
    }
  }
  return next(params);
});
 
export async function ensureNewDbConnection(): Promise<void> {
	// Simple health check; throws if NEW_DATABASE_URL is misconfigured
	await prismaNew.$queryRaw`SELECT 1`;
} 