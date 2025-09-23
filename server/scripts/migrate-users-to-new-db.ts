import { PrismaClient as OldPrisma } from '@prisma/client';
import { PrismaClient as NewPrisma } from '../node_modules/.prisma/new-client';

async function main() {
	const oldDb = new OldPrisma();
	// NEW_DATABASE_URL must be set; new client is configured in prisma/new-schema.prisma
	const newDb = new NewPrisma();

	console.log('[USER MIGRATION] Starting...');
	const users = await oldDb.user.findMany();
	console.log(`[USER MIGRATION] Found ${users.length} users in old DB`);

	let migrated = 0;
	for (const u of users) {
		const coins = (u as any).coins ?? 0;
		const soundEnabled = (u as any).soundEnabled ?? true;
		await newDb.user.upsert({
			where: { discordId: u.discordId },
			update: {
				id: u.id,
				username: u.username,
				avatarUrl: (u as any).avatar ?? null,
				isVerified: (u as any).isVerified ?? false,
				coins,
				soundEnabled,
				createdAt: u.createdAt,
			},
			create: {
				id: u.id,
				discordId: u.discordId,
				username: u.username,
				avatarUrl: (u as any).avatar ?? null,
				isVerified: (u as any).isVerified ?? false,
				coins,
				soundEnabled,
				createdAt: u.createdAt,
			},
		});
		migrated++;
	}

	console.log(`[USER MIGRATION] Completed. Migrated ${migrated} users.`);
	await oldDb.$disconnect();
	await newDb.$disconnect();
}

main().catch(async (err) => {
	console.error('[USER MIGRATION] Failed:', err);
	process.exitCode = 1;
}); 