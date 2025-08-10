import { Client, GatewayIntentBits, Events, GuildMember, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

const LEAGUE_ROLE_ID = '1403953667501195284';
const GUILD_ID = '1403837418494492763';
const VERIFICATION_CHANNEL_ID = '1403960351107715073';

// Store verified Facebook connections (in production, this should be in database)
const verifiedFacebookUsers = new Set<string>();

// Function to check if user has Facebook connected via OAuth2
async function hasFacebookConnected(userId: string): Promise<boolean> {
  try {
    // First check if user has been manually verified
    if (verifiedFacebookUsers.has(userId)) {
      console.log(`User ${userId} Facebook connection check (manual): true`);
      return true;
    }

    // Try to check via OAuth2 connections (this would require user to authorize)
    // For now, we'll use a different approach - check if user has connected accounts
    // This requires the user to have authorized our app with 'connections' scope
    
    console.log(`User ${userId} Facebook connection check: attempting OAuth2 check`);
    
    // Note: This would require the user to have authorized our app with 'connections' scope
    // and we would need to store their OAuth2 access token
    // For now, return false and rely on manual verification
    
    return false;
  } catch (error) {
    console.error(`Error checking Facebook connection for user ${userId}:`, error);
    return false;
  }
}

// Function to verify a user's Facebook connection
async function verifyFacebookConnection(userId: string): Promise<void> {
  try {
    verifiedFacebookUsers.add(userId);
    console.log(`Verified Facebook connection for user ${userId}`);
    
    // Update their Discord role
    await checkAndUpdateUserRole(userId);
  } catch (error) {
    console.error(`Error verifying Facebook connection for user ${userId}:`, error);
  }
}

// Function to revoke Facebook verification
async function revokeFacebookVerification(userId: string): Promise<void> {
  try {
    verifiedFacebookUsers.delete(userId);
    console.log(`Revoked Facebook verification for user ${userId}`);
    
    // Update their Discord role
    await checkAndUpdateUserRole(userId);
  } catch (error) {
    console.error(`Error revoking Facebook verification for user ${userId}:`, error);
  }
}

// Function to award LEAGUE role
async function awardLeagueRole(member: GuildMember): Promise<void> {
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

// Function to remove LEAGUE role if Facebook is disconnected
async function removeLeagueRole(member: GuildMember): Promise<void> {
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

// Check and update role for a specific user
async function checkAndUpdateUserRole(userId: string): Promise<void> {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) {
      console.error('Guild not found');
      return;
    }
    
    const member = await guild.members.fetch(userId);
    const hasFacebook = await hasFacebookConnected(userId);
    
    if (hasFacebook) {
      await awardLeagueRole(member);
    } else {
      await removeLeagueRole(member);
    }
  } catch (error) {
    console.error(`Error checking/updating role for user ${userId}:`, error);
  }
}

// Function to create and post the verification embed
async function postVerificationEmbed(): Promise<void> {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) {
      console.error('Guild not found');
      return;
    }

    console.log('Available channels in guild:');
    guild.channels.cache.forEach((ch, id) => {
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

// Event: Bot is ready
client.once(Events.ClientReady, () => {
  console.log(`Discord bot logged in as ${client.user?.tag}`);
  console.log(`Monitoring guild: ${GUILD_ID}`);
  
  // Post the verification embed when bot starts
  postVerificationEmbed();
});

// Event: New member joins
client.on(Events.GuildMemberAdd, async (member) => {
  console.log(`New member joined: ${member.user.username} (${member.id})`);
  
  // Check if they have Facebook connected and award role if so
  const hasFacebook = await hasFacebookConnected(member.id);
  if (hasFacebook) {
    await awardLeagueRole(member);
  }
});

// Event: Member updates (profile changes, etc.)
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  // Check if Facebook connection status changed
  const oldHasFacebook = await hasFacebookConnected(oldMember.id);
  const newHasFacebook = await hasFacebookConnected(newMember.id);
  
  if (oldHasFacebook !== newHasFacebook) {
    console.log(`Facebook connection status changed for ${newMember.user.username}: ${oldHasFacebook} -> ${newHasFacebook}`);
    
    if (newHasFacebook) {
      await awardLeagueRole(newMember);
    } else {
      await removeLeagueRole(newMember);
    }
  }
});

// Command to manually check all members
client.on(Events.InteractionCreate, async (interaction) => {
  // Handle button interactions
  if (interaction.isButton()) {
    if (interaction.customId === 'verify_facebook') {
      await interaction.deferReply({ ephemeral: true });
      
      try {
        const userId = interaction.user.id;
        
        // Redirect user to OAuth2 flow to check their Facebook connection
        const authUrl = `https://bux-spades-server.fly.dev/api/auth/discord/connections`;
        
        await interaction.editReply(`🔗 **Facebook Connection Check Required**\n\nTo verify your Facebook connection, please visit this link:\n${authUrl}\n\nThis will check if you have Facebook connected to your Discord profile and award the LEAGUE role if verified.`);
      } catch (error) {
        console.error('Error handling verify button:', error);
        await interaction.editReply('❌ Error processing verification request. Please try again later.');
      }
      return;
    }
  }
  
  // Handle slash commands
  if (!interaction.isCommand()) return;
  
  if (interaction.commandName === 'checkfacebook') {
    await interaction.deferReply();
    
    try {
      const guild = interaction.guild;
      if (!guild) {
        await interaction.editReply('This command can only be used in a guild.');
        return;
      }
      
      const members = await guild.members.fetch();
      let checkedCount = 0;
      let awardedCount = 0;
      let removedCount = 0;
      
      for (const [, member] of members) {
        const hasFacebook = await hasFacebookConnected(member.id);
        const hasLeagueRole = member.roles.cache.has(LEAGUE_ROLE_ID);
        
        if (hasFacebook && !hasLeagueRole) {
          await awardLeagueRole(member);
          awardedCount++;
        } else if (!hasFacebook && hasLeagueRole) {
          await removeLeagueRole(member);
          removedCount++;
        }
        
        checkedCount++;
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      await interaction.editReply(
        `✅ Checked ${checkedCount} members\n` +
        `🎉 Awarded LEAGUE role to ${awardedCount} members\n` +
        `🗑️ Removed LEAGUE role from ${removedCount} members`
      );
    } catch (error) {
      console.error('Error in checkfacebook command:', error);
      await interaction.editReply('❌ Error checking Facebook connections');
    }
  }
});

// Export functions for external use
export { 
  checkAndUpdateUserRole, 
  awardLeagueRole, 
  removeLeagueRole,
  verifyFacebookConnection,
  revokeFacebookVerification
};

// Start the bot when this module is loaded
const token = process.env.DISCORD_BOT_TOKEN;
console.log('Discord bot startup check:');
console.log('- Token exists:', !!token);
console.log('- Token length:', token ? token.length : 0);
console.log('- Guild ID:', GUILD_ID);
console.log('- Channel ID:', VERIFICATION_CHANNEL_ID);
console.log('- Role ID:', LEAGUE_ROLE_ID);

if (token && token.trim() !== '') {
  console.log('Attempting to start Discord bot...');
  client.login(token).then(() => {
    console.log('Discord bot login successful!');
  }).catch((error) => {
    console.error('Failed to start Discord bot:', error);
    console.log('Discord bot will not be available');
  });
} else {
  console.log('Discord bot token not provided, bot will not start');
}

export default client; 