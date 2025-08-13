import { Client, GatewayIntentBits, Events, GuildMember, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, TextChannel } from 'discord.js';
import { PrismaClient } from '@prisma/client';
import { registerCommands } from './commands';

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
const RESULTS_CHANNEL_ID = '1404128066296610878';



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
  nil: string | null;
  blindNil: string | null;
  players: {
    userId: string;
    username: string;
    seat: number;
    avatar?: string; // Optional avatar URL
  }[];
  createdAt: number;
}

const activeGameLines = new Map<string, GameLine>();



// Load verified users from database on startup
async function loadVerifiedUsersFromDatabase() {
  try {
    // Get all users with discordId (these are Discord users)
    const users = await prisma.user.findMany({
      where: {
        discordId: { not: null }
      },
      select: {
        discordId: true
      }
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
  }
}

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
  
  // Verification embed is now posted manually when needed
  // postVerificationEmbed();
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
      // Only remove role if user is definitely not verified (not just temporarily unavailable)
      const userInDatabase = await prisma.user.findFirst({
        where: { discordId: newMember.id }
      });
      
      if (!userInDatabase) {
        await removeLeagueRole(newMember);
      } else {
        console.log(`Keeping LEAGUE role for ${newMember.user.username} - user exists in database (was verified)`);
      }
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
          
          // Assign seat based on join order - use sequential seats 0, 1, 2, 3
          const seat = gameLine.players.length;
          
          // Add player to game
          // Get the user's avatar
          const user = await client.users.fetch(userId);
          const avatar = user.displayAvatarURL({ extension: 'png', size: 128 });
          
          gameLine.players.push({
            userId,
            username,
            seat,
            avatar
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
  
  if (['game', 'whiz', 'mirror', 'gimmick'].includes(interaction.commandName)) {
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
      const specialRules = interaction.options.getString('specialrules');
      
      // Parse special rules
      let screamer: string | null = null;
      let assassin: string | null = null;
      
      if (specialRules === 'screamer') {
        screamer = 'yes';
      } else if (specialRules === 'assassin') {
        assassin = 'yes';
      }
      
      let gameType: string;
      let nil: string | null = null;
      let blindNil: string | null = null;
      
      if (interaction.commandName === 'game') {
        gameType = 'regular';
        nil = interaction.options.getString('nil');
        blindNil = interaction.options.getString('blindnil');
      } else if (interaction.commandName === 'whiz') {
        gameType = 'WHIZ';
      } else if (interaction.commandName === 'mirror') {
        gameType = 'MIRROR';
      } else if (interaction.commandName === 'gimmick') {
        gameType = interaction.options.getString('gimmicktype', true);
      }
      
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
      
      // Add nil/blind nil settings only for regular games
      if (gameType === 'regular') {
        if (nil === 'no') rules.push('NO NIL');
        if (blindNil === 'yes') rules.push('BLIND NIL');
      }
      
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
        nil,
        blindNil,
        players: [
          {
            userId: interaction.user.id,
            username: interaction.user.username,
            seat: 0, // Host is seat 0
            avatar: interaction.user.displayAvatarURL({ extension: 'png', size: 128 })
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
  
  // Handle stats command
  if (interaction.commandName === 'stats') {
    await interaction.deferReply();
    
    try {
      if (!interaction.isChatInputCommand()) {
        await interaction.editReply('❌ This command can only be used as a slash command.');
        return;
      }
      
      const targetUser = interaction.options.getUser('user') || interaction.user;
      
      // Get user stats from database
      const user = await prisma.user.findFirst({
        where: { discordId: targetUser.id },
        include: { stats: true }
      });
      
      if (!user || !user.stats) {
        await interaction.editReply(`❌ No stats found for ${targetUser.username}`);
        return;
      }
      
      const stats = user.stats;
      
      // Calculate win percentage
      const totalWinPercentage = stats.gamesPlayed > 0 ? ((stats.gamesWon / stats.gamesPlayed) * 100).toFixed(1) : '0.0';
      
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle(`📊 Stats for ${targetUser.username}`)
        .setThumbnail('https://www.bux-spades.pro/bux-spades.png')
        .addFields(
          { name: '🎮 Total Games', value: stats.gamesPlayed.toString(), inline: true },
          { name: '🏆 Total Wins', value: stats.gamesWon.toString(), inline: true },
          { name: '📈 Win Rate', value: `${totalWinPercentage}%`, inline: true },
          { name: '💰 Total Coins Won', value: stats.totalCoinsWon.toLocaleString(), inline: true },
          { name: '💸 Total Coins Lost', value: stats.totalCoinsLost.toLocaleString(), inline: true },
          { name: '💵 Net Coins', value: stats.netCoins.toLocaleString(), inline: true }
        )
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error fetching stats:', error);
      await interaction.editReply('❌ Error fetching stats. Please try again.');
    }
    return;
  }
  
  // Handle help command
  if (interaction.commandName === 'help') {
    await interaction.deferReply();
    
    try {
      if (!interaction.isChatInputCommand()) {
        await interaction.editReply('❌ This command can only be used as a slash command.');
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('🎮 BUX Spades Discord Commands')
        .setDescription('Here are all available commands and how to use them:\n')
        .setThumbnail('https://www.bux-spades.pro/bux-spades.png')
        .addFields(
          { 
            name: '🎯 Game Creation Commands', 
            value: '\n**/game** - Create a regular bidding game\n**/whiz** - Create a Whiz game\n**/mirror** - Create a Mirror game\n**/gimmick** - Create a Gimmick game (Suicide, 4 or Nil, etc.)\n',
            inline: false 
          },
          { 
            name: '\u200b', 
            value: '\u200b',
            inline: false 
          },
          { 
            name: '📊 Stats Commands', 
            value: '\n**/stats** - Show your game statistics\n**/stats @user** - Show another user\'s statistics\n',
            inline: false 
          },
          { 
            name: '\u200b', 
            value: '\u200b',
            inline: false 
          },
          { 
            name: '📋 Game Options', 
            value: '\n• **Coins**: 100k to 10M buy-in\n• **Game Mode**: Partners or Solo\n• **Points**: 100-650 max, -250 to -100 min\n• **Special Rules**: None, Screamer, Assassin\n• **Nil Options**: On/Off for regular games\n• **Blind Nil Options**: On/Off for regular games',
            inline: false 
          }
        )
        .setFooter({ text: 'Need help? Ask in chat!' })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error showing help:', error);
      await interaction.editReply('❌ Error showing help. Please try again.');
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
          // Only remove role if user is definitely not verified (not just temporarily unavailable)
          const userInDatabase = await prisma.user.findFirst({
            where: { discordId: member.id }
          });
          
          if (!userInDatabase) {
            await removeLeagueRole(member);
            removedCount++;
          } else {
            console.log(`Keeping LEAGUE role for ${member.user.username} - user exists in database (was verified)`);
          }
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
    } else if (gameLine.gameMode === 'partners') {
      // Partners mode: Red team vs Blue team
      const redTeam = gameLine.players.slice(0, 2);
      const blueTeam = gameLine.players.slice(2, 4);
      
      // Red team (first 2 players)
      if (redTeam.length > 0) {
        playerList += `🔴 **Red Team:**\n`;
        redTeam.forEach(player => {
          playerList += `• <@${player.userId}>\n`;
        });
        playerList += '\n';
      }
      
      // Blue team (next 2 players)
      if (blueTeam.length > 0) {
        playerList += `🔵 **Blue Team:**\n`;
        blueTeam.forEach(player => {
          playerList += `• <@${player.userId}>\n`;
        });
      }
      
      // If no blue team players yet, show empty slots
      if (blueTeam.length === 0 && redTeam.length < 4) {
        playerList += `🔵 **Blue Team:**\n• *Empty*\n`;
      }
    } else {
      // Solo mode: Individual player colors
      const soloColors = ['🔴', '🔵', '🟠', '🟢']; // Red, Blue, Orange, Green
      const colorNames = ['Red', 'Blue', 'Orange', 'Green'];
      
      gameLine.players.forEach((player, index) => {
        const color = soloColors[index];
        const colorName = colorNames[index];
        playerList += `${color} **${colorName} Player:**\n• <@${player.userId}>\n\n`;
      });
      
      // Show empty slots for remaining positions
      for (let i = gameLine.players.length; i < 4; i++) {
        const color = soloColors[i];
        const colorName = colorNames[i];
        playerList += `${color} **${colorName} Player:**\n• *Empty*\n\n`;
      }
    }
    
    // Add info about remaining slots
    const remainingSlots = 4 - gameLine.players.length;
    const slotsInfo = remainingSlots > 0 ? `\n\n**${remainingSlots} more player${remainingSlots === 1 ? '' : 's'} needed**` : '\n\n**Game is full!**';
    
    // Create the embed
    const embed = new EmbedBuilder()
      .setColor(0x00ff00) // Green color
      .setTitle('🎮 GAME LINE')
      .setDescription(`**${gameLineTitle}**${specialRulesText}`)
      .setThumbnail('https://www.bux-spades.pro/bux-spades.png')
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
      creatorName: gameLine.hostName,
      buyIn: gameLine.coins,
      gameMode: gameLine.gameMode,
      maxPoints: gameLine.maxPoints,
      minPoints: gameLine.minPoints,
      gameType: gameLine.gameType,
      league: true, // Mark as league game
      specialRules: {
        screamer: gameLine.screamer === 'yes',
        assassin: gameLine.assassin === 'yes',
        // Only apply nil/blind nil settings for regular games
        allowNil: gameLine.gameType === 'regular' ? (gameLine.nil === 'yes') : true,
        allowBlindNil: gameLine.gameType === 'regular' ? (gameLine.blindNil === 'yes') : false
      },
      players: gameLine.players.map(p => ({
        userId: p.userId,
        username: p.username,
        discordId: p.userId, // Use Discord ID for matching
        seat: p.seat,
        avatar: p.avatar // Include avatar if available
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
      
      // Build game line format: "100k Partners 100/-100 Regular nil tick bn cross"
      let gameLineFormat = `${gameLine.coins >= 1000000 ? `${gameLine.coins / 1000000}M` : `${gameLine.coins / 1000}k`} ${gameLine.gameMode.charAt(0).toUpperCase() + gameLine.gameMode.slice(1)} ${gameLine.maxPoints}/${gameLine.minPoints} ${gameLine.gameType.charAt(0).toUpperCase() + gameLine.gameType.slice(1)}`;
      
      // Add nil and blind nil indicators
      if (gameLine.gameType === 'regular') {
        gameLineFormat += ` nil ${gameLine.nil === 'yes' ? '☑️' : '❌'} bn ${gameLine.blindNil === 'yes' ? '☑️' : '❌'}`;
      }
      
      // Build team information
      let teamInfo = '';
      if (gameLine.gameMode === 'partners') {
        const redTeam = gameLine.players.filter(p => p.seat === 0 || p.seat === 2).map(p => `<@${p.userId}>`);
        const blueTeam = gameLine.players.filter(p => p.seat === 1 || p.seat === 3).map(p => `<@${p.userId}>`);
        teamInfo = `🔴 **Red Team:** ${redTeam.join(', ')}\n🔵 **Blue Team:** ${blueTeam.join(', ')}`;
      } else {
        // Solo mode
        const soloColors = ['🔴', '🔵', '🟠', '🟢'];
        const colorNames = ['Red', 'Blue', 'Orange', 'Green'];
        teamInfo = gameLine.players.map((p, index) => 
          `${soloColors[index]} **${colorNames[index]} Player:** <@${p.userId}>`
        ).join('\n');
      }
      
      // Create game ready embed
      const gameReadyEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('🎮 Table Up!')
        .setDescription(`**${gameLineFormat}**\n\n${teamInfo}\n\n**Please open your BUX Spades app, login with your Discord profile and you will be directed to your table...**\n\n**GOOD LUCK! 🍀**`)
        .setThumbnail('https://www.bux-spades.pro/bux-spades.png')
        .setTimestamp();
      
      await message.reply({ embeds: [gameReadyEmbed] });
      
      // Remove game line from active list
      activeGameLines.delete(message.id);
      
      // Build special rules text for final embed
      let finalSpecialRulesText = '';
      const finalRules = [];
      if (gameLine.screamer === 'yes') finalRules.push('SCREAMER');
      if (gameLine.assassin === 'yes') finalRules.push('ASSASSIN');
      
      // Add nil/blind nil settings only for regular games
      if (gameLine.gameType === 'regular') {
        if (gameLine.nil === 'no') finalRules.push('NO NIL');
        if (gameLine.blindNil === 'yes') finalRules.push('BLIND NIL');
      }
      
      if (finalRules.length > 0) {
        finalSpecialRulesText = `\n**Special Rules:** ${finalRules.join(' + ')}`;
      }
      
      // Update original embed to show game is full
      const finalEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('🎮 GAME LINE - FULL')
        .setDescription(`**${gameLine.coins >= 1000000 ? `${gameLine.coins / 1000000}M` : `${gameLine.coins / 1000}k`} ${gameLine.gameMode.toUpperCase()} ${gameLine.maxPoints}/${gameLine.minPoints} ${gameLine.gameType.toUpperCase()}**${finalSpecialRulesText}`)
        .setThumbnail('https://www.bux-spades.pro/bux-spades.png')
        .addFields(
          { name: '👤 Host', value: `<@${gameLine.hostId}>`, inline: true },
          { name: '👥 Players', value: '4/4', inline: true },
          { name: '⏰ Created', value: `<t:${Math.floor(gameLine.createdAt / 1000)}:R>`, inline: true }
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

// Function to send league game results to Discord
async function sendLeagueGameResults(gameData: any, gameLine: string) {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = await guild.channels.fetch(RESULTS_CHANNEL_ID) as TextChannel;
    
    if (!channel) {
      console.error('Results channel not found');
      return;
    }
    
    // Determine winners and losers
    const winners = gameData.players.filter((p: any) => p.won).map((p: any) => `<@${p.userId}>`);
    const losers = gameData.players.filter((p: any) => !p.won).map((p: any) => `<@${p.userId}>`);
    
    // Calculate coins won
    const coinsWon = gameData.buyIn * 2; // Winners split the pot
    
    const resultsEmbed = new EmbedBuilder()
      .setTitle('🏆 League Game Results')
      .setDescription(`**${gameLine}**`)
      .setThumbnail('https://www.bux-spades.pro/bux-spades.png')
      .addFields(
        { name: '🥇 Winners', value: winners.join(', '), inline: true },
        { name: '💰 Coins Won', value: `${coinsWon >= 1000000 ? `${coinsWon / 1000000}M` : `${coinsWon / 1000}k`}`, inline: true },
        { name: '🥈 Losers', value: losers.join(', '), inline: true }
      )
      .setColor(0x00ff00)
      .setTimestamp();
    
    await channel.send({ embeds: [resultsEmbed] });
    console.log('Sent league game results to Discord');
  } catch (error) {
    console.error('Error sending league game results:', error);
  }
}

// Export functions for external use
export { 
  checkAndUpdateUserRole, 
  awardLeagueRole, 
  removeLeagueRole,
  verifyFacebookConnection,
  revokeFacebookVerification,
  markOAuth2Verified,
  sendLeagueGameResults
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
  client.login(token).then(async () => {
    console.log('Discord bot login successful!');
    // Register slash commands
    await registerCommands();
    // Load verified users from database after successful login
    await loadVerifiedUsersFromDatabase();
  }).catch((error) => {
    console.error('Failed to start Discord bot:', error);
    console.log('Discord bot will not be available');
  });
} else {
  console.log('Discord bot token not provided, bot will not start');
}

export default client; 