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



// Store active game lines
interface GameLine {
  messageId: string;
  hostId: string;
  hostName: string;
  coins: number;
  gameMode: string;
  maxPoints: number;
  minPoints: number;
  gameType: string;
  screamer: string | null;
  assassin: string | null;
  players: {
    userId: string;
    username: string;
    seat: number;
  }[];
  createdAt: number;
}

const activeGameLines = new Map<string, GameLine>();

// Function to check if user has Facebook connected via OAuth2
async function hasFacebookConnected(userId: string): Promise<boolean> {
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

// Function to verify a user's Facebook connection
async function verifyFacebookConnection(userId: string): Promise<void> {
  try {
    console.log(`Starting Facebook verification for user ${userId}`);
    oauth2VerifiedUsers.add(userId);
    console.log(`Added user ${userId} to oauth2VerifiedUsers set`);
    
    // Update their Discord role
    console.log(`Calling checkAndUpdateUserRole for user ${userId}`);
    await checkAndUpdateUserRole(userId);
    console.log(`Successfully completed Facebook verification for user ${userId}`);
  } catch (error) {
    console.error(`Error verifying Facebook connection for user ${userId}:`, error);
  }
}

// Store users who have been verified through OAuth2
const oauth2VerifiedUsers = new Set<string>();

// Function to mark user as verified through OAuth2
async function markOAuth2Verified(userId: string): Promise<void> {
  try {
    console.log(`Marking user ${userId} as OAuth2 verified`);
    oauth2VerifiedUsers.add(userId);
    
    // Update their Discord role
    await checkAndUpdateUserRole(userId);
    console.log(`Successfully marked user ${userId} as OAuth2 verified`);
  } catch (error) {
    console.error(`Error marking user ${userId} as OAuth2 verified:`, error);
  }
}

// Function to revoke Facebook verification
async function revokeFacebookVerification(userId: string): Promise<void> {
  try {
    oauth2VerifiedUsers.delete(userId);
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
    console.log(`Starting checkAndUpdateUserRole for user ${userId}`);
    
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) {
      console.error('Guild not found');
      return;
    }
    console.log(`Found guild: ${guild.name}`);
    
    const member = await guild.members.fetch(userId);
    console.log(`Found member: ${member.user.username} (${member.id})`);
    
    const hasFacebook = await hasFacebookConnected(userId);
    console.log(`User ${userId} Facebook connection check result: ${hasFacebook}`);
    
    if (hasFacebook) {
      console.log(`Awarding LEAGUE role to ${member.user.username}`);
      await awardLeagueRole(member);
    } else {
      console.log(`Removing LEAGUE role from ${member.user.username}`);
      await removeLeagueRole(member);
    }
    
    console.log(`Completed checkAndUpdateUserRole for user ${userId}`);
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
    
    // Handle game line buttons
    if (interaction.customId === 'join_game' || interaction.customId === 'leave_game' || interaction.customId === 'start_game') {
      await interaction.deferReply({ ephemeral: true });
      
      try {
        const userId = interaction.user.id;
        const username = interaction.user.username;
        const messageId = interaction.message.id;
        const gameLine = activeGameLines.get(messageId);
        
        if (!gameLine) {
          await interaction.editReply('❌ Game line not found or expired.');
          return;
        }
        
        if (interaction.customId === 'join_game') {
          // Check if user is already in the game
          const existingPlayer = gameLine.players.find(p => p.userId === userId);
          if (existingPlayer) {
            await interaction.editReply('❌ You are already in this game!');
            return;
          }
          
          // Check if game is full
          if (gameLine.players.length >= 4) {
            await interaction.editReply('❌ This game is full!');
            return;
          }
          
          // Assign seat based on join order
          let seat: number;
          if (gameLine.players.length === 1) {
            seat = 2; // Partner (seat 2)
          } else if (gameLine.players.length === 2) {
            seat = 1; // Player 3 (seat 1)
          } else {
            seat = 3; // Player 4 (seat 3)
          }
          
          // Add player to game
          gameLine.players.push({
            userId,
            username,
            seat
          });
          
          // Update embed
          await updateGameLineEmbed(interaction.message, gameLine);
          
          await interaction.editReply(`✅ You have joined the game! You are seat ${seat}.`);
          
          // Check if game is full and create it
          if (gameLine.players.length === 4) {
            await createGameAndNotifyPlayers(interaction.message, gameLine);
          }
          
        } else if (interaction.customId === 'leave_game') {
          // Check if user is in the game
          const playerIndex = gameLine.players.findIndex(p => p.userId === userId);
          if (playerIndex === -1) {
            await interaction.editReply('❌ You are not in this game!');
            return;
          }
          
          // Remove player from game
          gameLine.players.splice(playerIndex, 1);
          
          // Update embed
          await updateGameLineEmbed(interaction.message, gameLine);
          
          await interaction.editReply('❌ You have left the game.');
          
        } else if (interaction.customId === 'start_game') {
          // Only host can start the game
          if (userId !== gameLine.hostId) {
            await interaction.editReply('❌ Only the host can start the game!');
            return;
          }
          
          // Check if game is full
          if (gameLine.players.length < 4) {
            await interaction.editReply('❌ Need 4 players to start the game!');
            return;
          }
          
          await createGameAndNotifyPlayers(interaction.message, gameLine);
          await interaction.editReply('🚀 Starting the game...');
        }
      } catch (error) {
        console.error('Error handling game button:', error);
        await interaction.editReply('❌ Error processing game action. Please try again later.');
      }
      return;
    }
  }
  
  // Handle slash commands
  if (!interaction.isCommand()) return;
  
  if (interaction.commandName === 'game') {
    await interaction.deferReply();
    
    try {
      // Check if this is a chat input command interaction
      if (!interaction.isChatInputCommand()) {
        await interaction.editReply('❌ This command can only be used as a slash command.');
        return;
      }
      
      const coins = interaction.options.getInteger('coins', true);
      const gameMode = interaction.options.getString('gamemode', true);
      const maxPoints = interaction.options.getInteger('maxpoints', true);
      const minPoints = interaction.options.getInteger('minpoints', true);
      const gameType = interaction.options.getString('gametype', true);
      const screamer = interaction.options.getString('screamer');
      const assassin = interaction.options.getString('assassin');
      
      // Format coins for display
      const formatCoins = (amount: number) => {
        if (amount >= 1000000) {
          return `${amount / 1000000}M`;
        } else {
          return `${amount / 1000}k`;
        }
      };
      
      // Format the game line title
      const gameLineTitle = `${formatCoins(coins)} ${gameMode.toUpperCase()} ${maxPoints}/${minPoints} ${gameType.toUpperCase()}`;
      
      // Build special rules text
      let specialRulesText = '';
      const rules = [];
      if (screamer === 'yes') rules.push('SCREAMER');
      if (assassin === 'yes') rules.push('ASSASSIN');
      if (rules.length > 0) {
        specialRulesText = `\n**Special Rules:** ${rules.join(' + ')}`;
      }
      
      // Create the embed
      const embed = new EmbedBuilder()
        .setColor(0x00ff00) // Green color
        .setTitle('🎮 GAME LINE')
        .setDescription(`**${gameLineTitle}**${specialRulesText}`)
        .addFields(
          { name: '👤 Host', value: `<@${interaction.user.id}>`, inline: true },
          { name: '👥 Players', value: '1/4', inline: true },
          { name: '⏰ Created', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        )
        .setFooter({ text: 'Click the buttons below to join or leave the game' })
        .setTimestamp();
      
      // Create join/leave buttons
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('join_game')
            .setLabel('Join Game')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
          new ButtonBuilder()
            .setCustomId('leave_game')
            .setLabel('Leave Game')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌'),
          new ButtonBuilder()
            .setCustomId('start_game')
            .setLabel('Start Game')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🚀')
            .setDisabled(true) // Disabled until 4 players join
        );
      
      const reply = await interaction.editReply({ embeds: [embed], components: [row] });
      
      // Store the game line data
      const gameLine: GameLine = {
        messageId: reply.id,
        hostId: interaction.user.id,
        hostName: interaction.user.username,
        coins,
        gameMode,
        maxPoints,
        minPoints,
        gameType,
        screamer,
        assassin,
        players: [
          {
            userId: interaction.user.id,
            username: interaction.user.username,
            seat: 0 // Host is seat 0
          }
        ],
        createdAt: Date.now()
      };
      
      activeGameLines.set(reply.id, gameLine);
    } catch (error) {
      console.error('Error in game command:', error);
      await interaction.editReply('❌ Error creating game line');
    }
    return;
  }
  
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

// Helper function to update game line embed
async function updateGameLineEmbed(message: any, gameLine: GameLine) {
  try {
    // Format coins for display
    const formatCoins = (amount: number) => {
      if (amount >= 1000000) {
        return `${amount / 1000000}M`;
      } else {
        return `${amount / 1000}k`;
      }
    };
    
    // Format the game line title
    const gameLineTitle = `${formatCoins(gameLine.coins)} ${gameLine.gameMode.toUpperCase()} ${gameLine.maxPoints}/${gameLine.minPoints} ${gameLine.gameType.toUpperCase()}`;
    
    // Build special rules text
    let specialRulesText = '';
    const rules = [];
    if (gameLine.screamer === 'yes') rules.push('SCREAMER');
    if (gameLine.assassin === 'yes') rules.push('ASSASSIN');
    if (rules.length > 0) {
      specialRulesText = `\n**Special Rules:** ${rules.join(' + ')}`;
    }
    
    // Build player list
    let playerList = '';
    if (gameLine.players.length === 0) {
      playerList = 'No players joined yet';
    } else if (gameLine.gameMode === 'Partners') {
      // Partners format: Red team vs Blue team
      const host = gameLine.players.find(p => p.seat === 0);
      const partner = gameLine.players.find(p => p.seat === 2);
      const player3 = gameLine.players.find(p => p.seat === 1);
      const player4 = gameLine.players.find(p => p.seat === 3);
      
      if (host && partner) {
        playerList += `<@${host.userId}> (Red)\n<@${partner.userId}> (Red)\n\n`;
      } else if (host) {
        playerList += `<@${host.userId}> (Red)\n\n`;
      }
      
      if (player3 && player4) {
        playerList += `Vs.\n\n<@${player3.userId}> (Blue)\n<@${player4.userId}> (Blue)`;
      } else if (player3) {
        playerList += `Vs.\n\n<@${player3.userId}> (Blue)`;
      } else {
        playerList += 'Vs.\n\n(Blue team empty)';
      }
    } else {
      // Solo format: keep original seat-based format
      playerList = gameLine.players.map(p => `<@${p.userId}> (Seat ${p.seat})`).join('\n');
    }
    
    // Add info about remaining slots
    const remainingSlots = 4 - gameLine.players.length;
    const slotsInfo = remainingSlots > 0 ? `\n\n**${remainingSlots} more player${remainingSlots === 1 ? '' : 's'} needed**` : '\n\n**Game is full!**';
    
    // Create the embed
    const embed = new EmbedBuilder()
      .setColor(0x00ff00) // Green color
      .setTitle('🎮 GAME LINE')
      .setDescription(`**${gameLineTitle}**${specialRulesText}`)
      .addFields(
        { name: '👤 Host', value: `<@${gameLine.hostId}>`, inline: true },
        { name: '👥 Players', value: `${gameLine.players.length}/4`, inline: true },
        { name: '⏰ Created', value: `<t:${Math.floor(gameLine.createdAt / 1000)}:R>`, inline: true },
        { name: '🎯 Current Players', value: playerList + slotsInfo, inline: false }
      )
      .setFooter({ text: 'Click the buttons below to join or leave the game' })
      .setTimestamp();
    
    // Create join/leave buttons
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('join_game')
          .setLabel('Join Game')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅')
          .setDisabled(gameLine.players.length >= 4),
        new ButtonBuilder()
          .setCustomId('leave_game')
          .setLabel('Leave Game')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('❌'),
        new ButtonBuilder()
          .setCustomId('start_game')
          .setLabel('Start Game')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🚀')
          .setDisabled(gameLine.players.length < 4)
      );
    
    await message.edit({ embeds: [embed], components: [row] });
  } catch (error) {
    console.error('Error updating game line embed:', error);
  }
}

// Helper function to create game and notify players
async function createGameAndNotifyPlayers(message: any, gameLine: GameLine) {
  try {
    // Create game on the server
    const gameData = {
      creatorId: gameLine.hostId,
      buyIn: gameLine.coins,
      gameMode: gameLine.gameMode,
      maxPoints: gameLine.maxPoints,
      minPoints: gameLine.minPoints,
      gameType: gameLine.gameType,
      specialRules: {
        screamer: gameLine.screamer === 'yes',
        assassin: gameLine.assassin === 'yes'
      },
      players: gameLine.players.map(p => ({
        userId: p.userId,
        username: p.username,
        seat: p.seat
      }))
    };
    
    // Make API call to create game
    const response = await fetch('https://bux-spades-server.fly.dev/api/games', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(gameData)
    });
    
    if (response.ok) {
      const game = await response.json() as any;
      const gameUrl = `https://bux-spades.pro/table/${game.id}`;
      
      // Ping all players
      const playerMentions = gameLine.players.map(p => `<@${p.userId}>`).join(' ');
      
      // Create game ready embed
      const gameReadyEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('🎮 Game Ready!')
        .setDescription(`${playerMentions}\n\nYour game is ready! Click the link below to join:`)
        .addFields(
          { name: '🔗 Game Link', value: gameUrl, inline: false },
          { name: '💰 Buy-in', value: gameLine.coins >= 1000000 ? `${gameLine.coins / 1000000}M` : `${gameLine.coins / 1000}k`, inline: true },
          { name: '🎯 Game Mode', value: gameLine.gameMode.charAt(0).toUpperCase() + gameLine.gameMode.slice(1), inline: true },
          { name: '📊 Points', value: `${gameLine.maxPoints}/${gameLine.minPoints}`, inline: true }
        )
        .setTimestamp();
      
      await message.reply({ embeds: [gameReadyEmbed] });
      
      // Remove game line from active list
      activeGameLines.delete(message.id);
      
      // Build special rules text for final embed
      let finalSpecialRulesText = '';
      const finalRules = [];
      if (gameLine.screamer === 'yes') finalRules.push('SCREAMER');
      if (gameLine.assassin === 'yes') finalRules.push('ASSASSIN');
      if (finalRules.length > 0) {
        finalSpecialRulesText = `\n**Special Rules:** ${finalRules.join(' + ')}`;
      }
      
      // Update original embed to show game is full
      const finalEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('🎮 GAME LINE - FULL')
        .setDescription(`**${gameLine.coins >= 1000000 ? `${gameLine.coins / 1000000}M` : `${gameLine.coins / 1000}k`} ${gameLine.gameMode.toUpperCase()} ${gameLine.maxPoints}/${gameLine.minPoints} ${gameLine.gameType.toUpperCase()}**${finalSpecialRulesText}`)
        .addFields(
          { name: '👤 Host', value: `<@${gameLine.hostId}>`, inline: true },
          { name: '👥 Players', value: '4/4', inline: true },
          { name: '⏰ Created', value: `<t:${Math.floor(gameLine.createdAt / 1000)}:R>`, inline: true },
          { name: '🔗 Game Link', value: gameUrl, inline: false }
        )
        .setFooter({ text: 'Game created! Check the reply above for details.' })
        .setTimestamp();
      
      await message.edit({ embeds: [finalEmbed], components: [] });
      
    } else {
      console.error('Failed to create game:', await response.text());
      await message.reply('❌ Failed to create game. Please try again.');
    }
  } catch (error) {
    console.error('Error creating game:', error);
    await message.reply('❌ Error creating game. Please try again.');
  }
}

// Export functions for external use
export { 
  checkAndUpdateUserRole, 
  awardLeagueRole, 
  removeLeagueRole,
  verifyFacebookConnection,
  revokeFacebookVerification,
  markOAuth2Verified
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