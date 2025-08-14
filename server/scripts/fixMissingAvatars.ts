import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixMissingAvatars() {
	try {
		console.log('Starting to fix missing avatars...');
		
		// Get all users without avatars or with default avatar placeholder
		const usersWithoutAvatars = await prisma.user.findMany({
			where: {
				AND: [
					{ discordId: { not: null } },
					{
						OR: [
							{ avatar: null },
							{ avatar: '' },
							{ avatar: '/default-pfp.jpg' }
						]
					}
				]
			},
			select: {
				id: true,
				username: true,
				discordId: true,
				avatar: true
			}
		});
		
		console.log(`Found ${usersWithoutAvatars.length} users to update`);
		if (usersWithoutAvatars.length) {
			console.table(usersWithoutAvatars.map(u => ({ id: u.id, username: u.username, discordId: u.discordId, avatar: u.avatar })));
		}
		
		for (const user of usersWithoutAvatars) {
			if (!user.discordId) {
				console.log(`Skipping ${user.username} - no Discord ID`);
				continue;
			}
			
			try {
				// Fetch user info from Discord API
				const response = await fetch(`https://discord.com/api/v10/users/${user.discordId}`, {
					headers: {
						'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`
					}
				});
				
				if (response.ok) {
					const discordUser = await response.json() as any;
					
					if (discordUser.avatar) {
						const avatarUrl = `https://cdn.discordapp.com/avatars/${user.discordId}/${discordUser.avatar}.png`;
						
						// Update the user's avatar
						await prisma.user.update({
							where: { id: user.id },
							data: { avatar: avatarUrl }
						});
						
						console.log(`✅ Updated avatar for ${user.username}: ${avatarUrl}`);
					} else {
						console.log(`⚠️  No avatar found for ${user.username} (Discord ID: ${user.discordId})`);
					}
				} else {
					console.log(`❌ Failed to fetch Discord user ${user.discordId} for ${user.username}: ${response.status}`);
				}
				
				// Add a small delay to avoid rate limiting
				await new Promise(resolve => setTimeout(resolve, 100));
				
			} catch (error) {
				console.error(`❌ Error processing ${user.username}:`, error);
			}
		}
		
		console.log('Avatar fix completed!');
		
	} catch (error) {
		console.error('Error in fixMissingAvatars:', error);
	} finally {
		await prisma.$disconnect();
	}
}

// Run the script
fixMissingAvatars(); 