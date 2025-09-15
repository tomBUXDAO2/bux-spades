import { GuildMember, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import prisma from '../../lib/prisma';
import { 
  LEAGUE_ROLE_ID, 
  GUILD_ID, 
  VERIFICATION_CHANNEL_ID 
} from '../constants';

// Store users who have been verified through OAuth2
export const oauth2VerifiedUsers = new Set<string>();

/**
 * Load verified users from database on startup
 */
export async function loadVerifiedUsersFromDatabase(): Promise<void> {
  try {
    console.log('[DISCORD BOT] Starting to load verified users from database...');
    
    // First, let's check how many total users we have
    const totalUsers = await prisma.user.count();
    console.log('[DISCORD BOT] Total users in database:', totalUsers);
    
    const usersWithDiscord = await prisma.user.count({
      where: {
        discordId: { not: null }
      }
    });
    console.log('[DISCORD BOT] Users with Discord ID:', usersWithDiscord);
    
    // Get all users with discordId (these are Discord users) - limit to recent users to reduce data transfer
    const users = await prisma.user.findMany({
      where: {
        discordId: { not: null }
      },
      select: {
        discordId: true
      },
      take: 1000 // Limit to 1000 most recent users to reduce data transfer
    });
    
    // Add all Discord users to the verified set (they've been verified through OAuth2)
    users.forEach(user => {
      if (user.discordId) {
        oauth2VerifiedUsers.add(user.discordId);
        console.log(`Loaded verified user from database: ${user.discordId}`);
      }
    });
    
    console.log(`Loaded ${oauth2VerifiedUsers.size} verified users from database`);
  } catch (error) {
    console.error('Error loading verified users from database:', error);
    
    // Check if it's a quota exceeded error
    if (error instanceof Error && error.message.includes('data transfer quota')) {
      console.warn('Database quota exceeded - Discord bot will continue without loading verified users');
      console.warn('Consider upgrading your Neon database plan or optimizing queries');
    } else {
      console.error('Unexpected error loading verified users:', error);
    }
  }
}

/**
 * Check if user has Facebook connected via OAuth2
 */
export async function hasFacebookConnected(userId: string): Promise<boolean> {
  try {
    // Check OAuth2 verified users set
    if (oauth2VerifiedUsers.has(userId)) {
      console.log(`User ${userId} Facebook connection check (OAuth2): true`);
      return true;
    }
    
    console.log(`User ${userId} Facebook connection check: false`);
    return false;
  } catch (error) {
    console.error(`Error checking Facebook connection for user ${userId}:`, error);
    return false;
  }
}

/**
 * Verify a user's Facebook connection
 */
export async function verifyFacebookConnection(userId: string, client: any): Promise<void> {
  try {
    console.log(`Starting Facebook verification for user ${userId}`);
    oauth2VerifiedUsers.add(userId);
    console.log(`Added user ${userId} to oauth2VerifiedUsers set`);
    
    // Update their Discord role
    console.log(`Calling checkAndUpdateUserRole for user ${userId}`);
    await checkAndUpdateUserRole(userId, client);
    console.log(`Successfully completed Facebook verification for user ${userId}`);
  } catch (error) {
    console.error(`Error verifying Facebook connection for user ${userId}:`, error);
  }
}

/**
 * Mark user as verified through OAuth2
 */
export async function markOAuth2Verified(userId: string, client: any): Promise<void> {
  try {
    console.log(`Marking user ${userId} as OAuth2 verified`);
    oauth2VerifiedUsers.add(userId);
    
    // Update their Discord role
    await checkAndUpdateUserRole(userId, client);
    console.log(`Successfully marked user ${userId} as OAuth2 verified`);
  } catch (error) {
    console.error(`Error marking user ${userId} as OAuth2 verified:`, error);
  }
}

/**
 * Revoke Facebook verification
 */
export async function revokeFacebookVerification(userId: string, client: any): Promise<void> {
  try {
    oauth2VerifiedUsers.delete(userId);
    console.log(`Revoked Facebook verification for user ${userId}`);
    
    // Update their Discord role
    await checkAndUpdateUserRole(userId, client);
  } catch (error) {
    console.error(`Error revoking Facebook verification for user ${userId}:`, error);
  }
}

/**
 * Award LEAGUE role to a member
 */
export async function awardLeagueRole(member: GuildMember): Promise<void> {
  try {
    const guild = member.guild;
    const leagueRole = guild.roles.cache.get(LEAGUE_ROLE_ID);
    
    if (!leagueRole) {
      console.error(`LEAGUE role with ID ${LEAGUE_ROLE_ID} not found in guild ${guild.name}`);
      return;
    }
    
    // Add the role to the member if they don't have it
    if (!member.roles.cache.has(leagueRole.id)) {
      await member.roles.add(leagueRole);
      console.log(`Awarded LEAGUE role to ${member.user.username} (${member.id})`);
    } else {
      console.log(`User ${member.user.username} already has LEAGUE role`);
    }
  } catch (error) {
    console.error(`Error awarding LEAGUE role to ${member.user.username}:`, error);
  }
}

/**
 * Remove LEAGUE role if Facebook is disconnected
 */
export async function removeLeagueRole(member: GuildMember): Promise<void> {
  try {
    const leagueRole = member.guild.roles.cache.get(LEAGUE_ROLE_ID);
    
    if (leagueRole && member.roles.cache.has(leagueRole.id)) {
      await member.roles.remove(leagueRole);
      console.log(`Removed LEAGUE role from ${member.user.username} (${member.id}) - Facebook disconnected`);
    }
  } catch (error) {
    console.error(`Error removing LEAGUE role from ${member.user.username}:`, error);
  }
}

/**
 * Check and update role for a specific user
 */
export async function checkAndUpdateUserRole(userId: string, client: any): Promise<void> {
  try {
    console.log(`Starting checkAndUpdateUserRole for user ${userId}`);
    
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) {
      console.error(`❌ Guild not found! GUILD_ID: ${GUILD_ID}`);
      console.error(`Available guilds: ${Array.from(client.guilds.cache.keys()).join(', ')}`);
      return;
    }
    console.log(`✅ Found guild: ${guild.name} (${guild.id})`);
    
    const member = await guild.members.fetch(userId);
    console.log(`Found member: ${member.user.username} (${member.id})`);
    
    const hasFacebook = await hasFacebookConnected(userId);
    console.log(`User ${userId} Facebook connection check result: ${hasFacebook}`);
    
    if (hasFacebook) {
      console.log(`Awarding LEAGUE role to ${member.user.username}`);
      await awardLeagueRole(member);
    } else {
      // Only remove role if user is definitely not verified (not just temporarily unavailable)
      // Check if user exists in database as a Discord user (which means they were verified)
      const userInDatabase = await prisma.user.findFirst({
        where: { discordId: userId }
      });
      
      if (!userInDatabase) {
        console.log(`Removing LEAGUE role from ${member.user.username} - user not in database`);
        await removeLeagueRole(member);
      } else {
        console.log(`Keeping LEAGUE role for ${member.user.username} - user exists in database (was verified)`);
      }
    }
    
    console.log(`Completed checkAndUpdateUserRole for user ${userId}`);
  } catch (error) {
    console.error(`Error checking/updating role for user ${userId}:`, error);
  }
}

/**
 * Create and post the verification embed
 */
export async function postVerificationEmbed(client: any): Promise<void> {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) {
      console.error('Guild not found');
      return;
    }

    console.log('Available channels in guild:');
    guild.channels.cache.forEach((ch: any, id: string) => {
      console.log(`- ${ch.name} (${id}) - Type: ${ch.type}`);
    });
    
    const channel = guild.channels.cache.get(VERIFICATION_CHANNEL_ID);
    if (!channel) {
      console.error(`Verification channel ${VERIFICATION_CHANNEL_ID} not found`);
      return;
    }
    if (channel.type !== ChannelType.GuildText) {
      console.error(`Channel ${channel.name} is not a text channel (type: ${channel.type})`);
      return;
    }

    // Create the embed
    const embed = new EmbedBuilder()
      .setTitle('🎮 League Game Rooms Access')
      .setDescription('League game rooms are only available to members who have linked their Facebook to their Discord profile.')
      .addFields(
        { name: '📋 Instructions', value: 'To connect your Facebook, please follow the instructions in the video above.' },
        { name: '✅ Verification', value: 'Once connected, click the verify button below to be assigned LEAGUE role and gain access to game rooms.' }
      )
      .setColor(0x00ff00) // Green color
      .setThumbnail('https://bux-spades.pro/bux-spades.png')
      .setTimestamp()
      .setFooter({ text: 'BUX Spades League' });

    // Create the verify button
    const verifyButton = new ButtonBuilder()
      .setCustomId('verify_facebook')
      .setLabel('Facebook Verify')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('✅');

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(verifyButton);

    // Post the embed
    await channel.send({
      embeds: [embed],
      components: [row]
    });

    console.log('Verification embed posted successfully');
  } catch (error) {
    console.error('Error posting verification embed:', error);
  }
}
