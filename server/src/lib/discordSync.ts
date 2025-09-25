import { prisma } from './prisma';

export async function syncDiscordUserData(userId: string): Promise<{ username: string; avatarUrl: string } | null> {
  try {
    // Get user with Discord ID
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { discordId: true, username: true, avatarUrl: true }
    });

    if (!user || !user.discordId) {
      console.log(`[DISCORD SYNC] User ${userId} has no Discord ID`);
      return null;
    }

    // Fetch current Discord user data using the user's Discord ID
    const discordUserResponse = await fetch(`https://discord.com/api/users/${user.discordId}`, {
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`
      }
    });

    if (!discordUserResponse.ok) {
      console.log(`[DISCORD SYNC] Failed to fetch Discord user data for ${user.discordId}:`, discordUserResponse.status);
      return null;
    }

    const discordUser = await discordUserResponse.json();
    
    // Get current nickname (global_name) or username
    const currentNickname = (discordUser as any).global_name || (discordUser as any).username;
    const currentAvatar = (discordUser as any).avatarUrl;

    // Check if we need to update
    const avatarUrl = currentAvatar ? `https://cdn.discordapp.com/avatars/${user.discordId}/${currentAvatar}.png` : '/default-pfp.jpg';
    
    if (user.username !== currentNickname || user.avatarUrl !== avatarUrl) {
      console.log(`[DISCORD SYNC] Updating user ${userId} data:`, {
        oldUsername: user.username,
        newUsername: currentNickname,
        oldAvatar: user.avatarUrl,
        newAvatar: avatarUrl
      });

      // Update user in database
      await prisma.user.update({
        where: { id: userId },
        data: {
          username: currentNickname,
          avatarUrl: avatarUrl,
          // updatedAt: new Date()
        }
      });

      return { username: currentNickname, avatarUrl: avatarUrl };
    } else {
      console.log(`[DISCORD SYNC] User ${userId} data is up to date`);
      return { username: user.username, avatarUrl: user.avatarUrl };
    }

  } catch (error) {
    console.error(`[DISCORD SYNC] Error syncing Discord data for user ${userId}:`, error);
    return null;
  }
}

export async function syncDiscordUserDataByDiscordId(discordId: string): Promise<{ username: string; avatarUrl: string } | null> {
  try {
    // Find user by Discord ID
    const user = await prisma.user.findUnique({
      where: { discordId },
      select: { id: true, username: true, avatarUrl: true }
    });

    if (!user) {
      console.log(`[DISCORD SYNC] No user found with Discord ID ${discordId}`);
      return null;
    }

    return await syncDiscordUserData(user.id);

  } catch (error) {
    console.error(`[DISCORD SYNC] Error syncing Discord data for Discord ID ${discordId}:`, error);
    return null;
  }
} 