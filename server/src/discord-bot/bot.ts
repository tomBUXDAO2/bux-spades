import { Client, GatewayIntentBits, Events, GuildMember, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, TextChannel } from 'discord.js';
import prisma from '../lib/prisma';
import { registerCommands } from './commands';
import jwt from 'jsonwebtoken';

// Prefer internal URL when running inside the server process
const INTERNAL_API_URL = process.env.INTERNAL_API_URL || 'http://127.0.0.1:3000';

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
interface GameLine { messageId: string; channelId: string; hostId: string; hostName: string; coins: number; gameMode: string; maxPoints: number; minPoints: number; gameType: string; screamer: string | null; assassin: string | null; nil: string | null; blindNil: string | null; players: { userId: string; username: string; seat: number; avatar?: string }[]; createdAt: number; timeout?: NodeJS.Timeout }
const activeGameLines = new Map<string, GameLine>();
const channelToOpenLine = new Map<string, string>();


// Load verified users from database on startup
async function loadVerifiedUsersFromDatabase() {
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
  // Autocomplete for coins based on channel
  if (interaction.isAutocomplete()) {
    try {
      const focused = interaction.options.getFocused(true);
      if (focused.name === 'coins') {
        const channelId = interaction.channelId;
        const lowRoomId = '1404937454938619927';
        const highRoomId = '1403844895445221445';
        const lowChoices = [100000,200000,300000,400000,500000,600000,700000,800000,900000];
        const highChoices = [1000000,2000000,3000000,4000000,5000000,6000000,7000000,8000000,9000000,10000000];
        const list = channelId === highRoomId ? highChoices : lowChoices;
        const query = String(focused.value || '').toLowerCase();
        const filtered = list.filter(v => (v>=1000000?`${v/1000000}m`:`${v/1000}k`).includes(query));
        await interaction.respond(filtered.slice(0,25).map(v => ({ name: v>=1000000?`${v/1000000}M`:`${v/1000}k`, value: v })));
        return;
      }
      if (focused.name === 'gimmicktype') {
        // Read gamemode robustly from provided options
        let gameModeOpt = interaction.options.getString('gamemode');
        if (!gameModeOpt) {
          const gm = (interaction.options as any).data?.find?.((d: any) => d?.name === 'gamemode');
          if (gm && typeof gm.value === 'string') gameModeOpt = gm.value;
        }
        if (typeof gameModeOpt === 'string') {
          gameModeOpt = gameModeOpt.toLowerCase();
        }
        const all = [
          { name: '4 or Nil', value: '4 OR NIL' },
          { name: 'Bid 3', value: 'BID 3' },
          { name: 'Bid Hearts', value: 'BID HEARTS' },
          { name: 'Crazy Aces', value: 'CRAZY ACES' },
          { name: 'Suicide', value: 'SUICIDE' }
        ];
        const list = gameModeOpt === 'solo' ? all.filter(o => o.value !== 'SUICIDE') : all;
        const q = String(focused.value || '').toLowerCase();
        const filtered = list.filter(o => o.name.toLowerCase().includes(q));
        await interaction.respond(filtered.slice(0,25));
        return;
      }
    } catch (e) {
      console.error('Autocomplete error:', e);
    }
  }

  try {
    // Restrict coin options based on channel
    const lowRoomId = '1404937454938619927';
    const highRoomId = '1403844895445221445';

    if (interaction.isChatInputCommand() && ['game','whiz','mirror','gimmick'].includes(interaction.commandName)) {
      // Per-channel guard: allow only one open line per channel
      const openInChannel = channelToOpenLine.get(interaction.channelId);
      if (openInChannel && activeGameLines.has(openInChannel)) {
        await interaction.editReply('❌ There is already an open game line in this room. Please wait until it fills or is cancelled.');
        return;
      }
      const coins = interaction.options.getInteger('coins', true);

      const chId = interaction.channelId;
      if (chId === lowRoomId && (coins < 100000 || coins > 900000)) {
        await interaction.reply({ content: '❌ In low-room, buy-in must be between 100k and 900k.', ephemeral: true });
        return;
      }
      if (chId === highRoomId && coins < 1000000) {
        await interaction.reply({ content: '❌ In high-room, buy-in must be 1M or higher.', ephemeral: true });
        return;
      }
    }
  } catch (e) {
    console.error('Channel restriction check failed:', e);
  }
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
    if (interaction.customId === 'join_game' || interaction.customId === 'leave_game' || interaction.customId === 'cancel_game') {
      if (interaction.customId === 'cancel_game') {
        // For cancel, defer the update without sending an ephemeral reply
        await interaction.deferUpdate();
      } else {
        // For join/leave, keep responses ephemeral
        await interaction.deferReply({ ephemeral: true });
      }
      
      try {
        const userId = interaction.user.id;
        const username = interaction.user.username;
        const messageId = interaction.message.id;
        const gameLine = activeGameLines.get(messageId);
        
        if (!gameLine) {
          if (interaction.customId === 'cancel_game') {
            await interaction.followUp({ content: '❌ Game line not found or expired.', ephemeral: true });
          } else {
            await interaction.editReply('❌ Game line not found or expired.');
          }
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
          
          // Assign seat based on required mapping: 0 (host), then 2, 1, 3
          const seatOrder = [0, 2, 1, 3] as const;
          const seat = seatOrder[gameLine.players.length] ?? gameLine.players.length;
          
          // Validate that the Discord user has an app account and enough coins
          try {
            const dbUser = await prisma.user.findUnique({ where: { discordId: userId } });
            if (!dbUser) {
              await interaction.editReply('❌ You need to log in to the app with your Discord account before joining game lines. Please visit https://bux-spades.pro/ and log in, then try again.');
              return;
            }
            if ((dbUser.coins ?? 0) < gameLine.coins) {
              await interaction.editReply(`❌ You do not have enough coins to join.\nRequired: ${gameLine.coins.toLocaleString()} | Your balance: ${(dbUser.coins ?? 0).toLocaleString()}\nPlease open a support ticket in <#1406332512476860446> to purchase more coins.`);
              return;
            }
          } catch (e) {
            console.error('Join validation failed:', e);
            await interaction.editReply('❌ Could not validate your account right now. Please try again shortly.');
            return;
          }
          
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
          
        } else if (interaction.customId === 'cancel_game') {
          // Only host or admins can cancel
          const isHost = userId === gameLine.hostId;
          const roles = (interaction.member?.roles as any);
          const isAdmin = !!(roles && (roles.cache ? roles.cache.has('1403850350091436123') : Array.isArray(roles) ? roles.includes('1403850350091436123') : false));
          if (!isHost && !isAdmin) {
            await interaction.followUp({ content: '❌ Only the host or an admin can cancel this game.', ephemeral: true });
            return;
          }
          activeGameLines.delete(messageId);
          channelToOpenLine.delete(gameLine.channelId);
          if (gameLine.timeout) clearTimeout(gameLine.timeout);
          // Disable buttons
          const disabledRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
              new ButtonBuilder().setCustomId('join_game').setLabel('Join Game').setStyle(ButtonStyle.Success).setEmoji('✅').setDisabled(true),
              new ButtonBuilder().setCustomId('leave_game').setLabel('Leave Game').setStyle(ButtonStyle.Danger).setEmoji('❌').setDisabled(true),
              new ButtonBuilder().setCustomId('cancel_game').setLabel('Cancel Game').setStyle(ButtonStyle.Secondary).setEmoji('🛑').setDisabled(true)
            );
          await interaction.message.edit({ components: [disabledRow] });
          // Announce cancellation publicly to the channel
          if (interaction.channel && 'send' in interaction.channel) {
            await (interaction.channel as any).send('🛑 Game line cancelled.');
          }
        }
      } catch (error) {
        console.error('Error handling game button:', error);
        if (interaction.customId === 'cancel_game') {
          await interaction.followUp({ content: '❌ Error processing game action. Please try again later.', ephemeral: true });
        } else {
          await interaction.editReply('❌ Error processing game action. Please try again later.');
        }
      }
      return;
    }
  }
  
  // Handle slash commands
  if (!interaction.isCommand()) return;
  
  if (['game', 'whiz', 'mirror', 'gimmick'].includes(interaction.commandName)) {
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Error deferring reply:', error);
      return;
    }
    
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
        // Default nil ON unless explicitly provided as 'no'
        const providedNil = interaction.options.getString('nil');
        nil = providedNil === 'no' ? 'no' : 'yes';
        blindNil = interaction.options.getString('blindnil') || 'no';
      } else if (interaction.commandName === 'whiz') {
        gameType = 'WHIZ';
      } else if (interaction.commandName === 'mirror') {
        gameType = 'MIRROR';
      } else if (interaction.commandName === 'gimmick') {
        gameType = interaction.options.getString('gimmicktype', true);
        // Block Suicide for Solo games
        if (gameMode === 'solo' && gameType === 'SUICIDE') {
          await interaction.editReply('❌ Suicide is partners-only. Please choose a different gimmick for Solo games.');
          return;
        }
      }
      
      // Validate host account exists in DB and has enough coins
      try {
        const host = await prisma.user.findUnique({ where: { discordId: interaction.user.id } });
        if (!host) {
          await interaction.editReply('❌ You need to log in to the app with your Discord account before creating game lines. Please visit https://bux-spades.pro/ and log in, then try again.');
          return;
        }
        if ((host.coins ?? 0) < coins) {
          await interaction.editReply(`❌ You do not have enough coins to create this game line.\nRequired: ${coins.toLocaleString()} | Your balance: ${(host.coins ?? 0).toLocaleString()}\nPlease open a support ticket in <#1406332512476860446> to purchase more coins.`);
          return;
        }
      } catch (e) {
        console.error('Host validation failed:', e);
        await interaction.editReply('❌ Could not validate your account right now. Please try again shortly.');
        return;
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
      
      // Build special rules line including nil/bn when regular
      const rules: string[] = [];
      if (gameType === 'regular') {
        rules.push(`nil ${nil === 'yes' ? '☑️' : '❌'}`);
        rules.push(`bn ${blindNil === 'yes' ? '☑️' : '❌'}`);
      }
      if (specialRules === 'screamer') rules.push('SCREAMER');
      if (specialRules === 'assassin') rules.push('ASSASSIN');
      const specialRulesText = rules.length > 0 ? `\n${rules.join(' ')}` : '';
      
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
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
            .setCustomId('cancel_game')
            .setLabel('Cancel Game')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🛑')
            .setDisabled(false)
        );
      
      const reply = await interaction.editReply({ embeds: [embed], components: [row] });
      
      // Store the game line data
      const gameLine: GameLine = {
        messageId: reply.id,
        channelId: interaction.channelId,
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
      // Per-channel guard: record open line for this channel
      channelToOpenLine.set(interaction.channelId, reply.id);
      // Auto-cancel after 20 minutes if not filled
      gameLine.timeout = setTimeout(async () => {
        const current = activeGameLines.get(reply.id);
        if (!current) return;
        try {
          // Announce publicly in the channel
          const channel = await client.channels.fetch(current.channelId) as TextChannel;
          if (channel) {
            await channel.send('⌛ Game line auto-cancelled after 20 minutes of inactivity.');
            // Disable buttons on the original message
            const msg = await channel.messages.fetch(current.messageId);
            const disabledRow = new ActionRowBuilder<ButtonBuilder>()
              .addComponents(
                new ButtonBuilder().setCustomId('join_game').setLabel('Join Game').setStyle(ButtonStyle.Success).setEmoji('✅').setDisabled(true),
                new ButtonBuilder().setCustomId('leave_game').setLabel('Leave Game').setStyle(ButtonStyle.Danger).setEmoji('❌').setDisabled(true),
                new ButtonBuilder().setCustomId('cancel_game').setLabel('Cancel Game').setStyle(ButtonStyle.Secondary).setEmoji('🛑').setDisabled(true)
              );
            await msg.edit({ components: [disabledRow] });
          }
          activeGameLines.delete(reply.id);
          channelToOpenLine.delete(current.channelId);
        } catch (e) {
          console.error('Auto-cancel failed:', e);
        }
      }, 20 * 60 * 1000);
    } catch (error) {
      console.error('Error in game command:', error);
      await interaction.editReply('❌ Error creating game line');
    }
    return;
  }
  
  // Handle stats command
  if (interaction.commandName === 'stats') {
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Error deferring stats reply:', error);
      return;
    }
    
    try {
      if (!interaction.isChatInputCommand()) {
        await interaction.editReply('❌ This command can only be used as a slash command.');
        return;
      }
      
      const targetUser = interaction.options.getUser('user') || interaction.user;
      
      // Get user stats from database
      const user = await prisma.user.findFirst({
        where: { discordId: targetUser.id },
        include: { UserStats: true }
      });
      
      if (!user || !user.UserStats) {
        await interaction.editReply(`❌ No stats found for ${targetUser.username}`);
        return;
      }
      
      const stats = user.UserStats as any;
      
      // Calculate win percentages
      const totalWinPercentage = stats.gamesPlayed > 0 ? ((stats.gamesWon / stats.gamesPlayed) * 100).toFixed(1) : '0.0';
      const leagueGames = (stats.partnersGamesPlayed ?? 0) + (stats.soloGamesPlayed ?? 0);
      const leagueWins = (stats.partnersGamesWon ?? 0) + (stats.soloGamesWon ?? 0);
      const leagueWinPct = leagueGames > 0 ? ((leagueWins / leagueGames) * 100).toFixed(1) : '0.0';
      
              const embed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle(`📊 Stats for ${targetUser.username}`)
          .setThumbnail(targetUser.displayAvatarURL({ extension: 'png', size: 128 }))
        .addFields(
          { name: 'TOTAL GAMES:', value: '\u200b', inline: false },
          { name: '🎮 Games', value: stats.gamesPlayed.toString(), inline: true },
          { name: '🏆 Wins', value: stats.gamesWon.toString(), inline: true },
          { name: '📈 Win Rate', value: `${totalWinPercentage}%`, inline: true },
          { name: '\u200b', value: '\u200b', inline: false },
          { name: 'LEAGUE GAMES:', value: '\u200b', inline: false },
          { name: '🎮 Games', value: leagueGames.toString(), inline: true },
          { name: '🏆 Wins', value: leagueWins.toString(), inline: true },
          { name: '📈 Win Rate', value: `${leagueWinPct}%`, inline: true },
          { name: '\u200b', value: '\u200b', inline: false },
          { name: 'COINS:', value: '\u200b', inline: false },
          { name: '💰', value: user.coins.toLocaleString(), inline: true }
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
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Error deferring help reply:', error);
      return;
    }
    
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
    try {
      await interaction.deferReply();
    } catch (error) {
      console.error('Error deferring checkfacebook reply:', error);
      return;
    }
    
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
    
    // Build line suffix including nil/bn when regular
    const parts: string[] = [];
    if (gameLine.gameType === 'regular') {
      parts.push(`nil ${gameLine.nil === 'yes' ? '☑️' : '❌'}`);
      parts.push(`bn ${gameLine.blindNil === 'yes' ? '☑️' : '❌'}`);
    }
    if (gameLine.screamer === 'yes') parts.push('SCREAMER');
    if (gameLine.assassin === 'yes') parts.push('ASSASSIN');
    const specialRulesText = parts.length > 0 ? `\n${parts.join(' ')}` : '';
    
    // Build player list
    let playerList = '';
    if (gameLine.players.length === 0) {
      playerList = 'No players joined yet';
    } else if (gameLine.gameMode === 'partners') {
      // Partners mode: Red team seats 0 & 2; Blue team seats 1 & 3
      const redTeam = gameLine.players.filter(p => p.seat === 0 || p.seat === 2).sort((a,b)=>a.seat-b.seat);
      const blueTeam = gameLine.players.filter(p => p.seat === 1 || p.seat === 3).sort((a,b)=>a.seat-b.seat);
      
      // Red team seats
      if (redTeam.length > 0) {
        playerList += `🔴 **Red Team:**\n`;
        redTeam.forEach(player => {
          playerList += `• <@${player.userId}>\n`;
        });
        playerList += '\n';
      }
      
      // Blue team seats
      if (blueTeam.length > 0) {
        playerList += `🔵 **Blue Team:**\n`;
        blueTeam.forEach(player => {
          playerList += `• <@${player.userId}>\n`;
        });
      }
      
      // If no blue team players yet, show empty slots
      if (blueTeam.length === 0 && redTeam.length < 2) {
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
          .setCustomId('cancel_game')
          .setLabel('Cancel Game')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🛑')
          .setDisabled(false)
      );
    
    await message.edit({ embeds: [embed], components: [row] });
  } catch (error) {
    console.error('Error updating game line embed:', error);
  }
}

// Helper function to create game and notify players
async function createGameAndNotifyPlayers(message: any, gameLine: GameLine) {
  try {
    // Find the database User ID for the host
    let hostUser = await prisma.user.findFirst({
      where: { discordId: gameLine.hostId }
    });
    
    if (!hostUser) {
      // Create user if doesn't exist
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date();
      
      hostUser = await prisma.user.create({
        data: {
          id: userId,
          username: gameLine.hostName,
          discordId: gameLine.hostId,
          coins: 5000000,
          avatar: null,
          createdAt: now,
          updatedAt: now
        } as any
      });
      
      // Create user stats
      const statsId = `stats_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await prisma.userStats.create({
        data: {
          id: statsId,
          userId: hostUser.id,
          createdAt: now,
          updatedAt: now
        } as any
      });
      
      console.log(`[DISCORD BOT] Created new user for host ${gameLine.hostName}: ${hostUser.id}`);
    }
    
    // Create game on the server
    const gameData = {
      creatorId: hostUser.id, // Use database User ID, not Discord ID
      creatorName: gameLine.hostName,
      buyIn: gameLine.coins,
      gameMode: gameLine.gameMode.toUpperCase(),
      maxPoints: gameLine.maxPoints,
      minPoints: gameLine.minPoints,
      gameType: gameLine.gameType,
      // Map gameType to server biddingOption
      biddingOption: ((): string => {
        const t = (gameLine.gameType || 'regular').toLowerCase();
        if (t === 'whiz') return 'WHIZ';
        if (t === 'mirror' || t === 'mirrors') return 'MIRROR';
        if (t === 'suicide') return 'SUICIDE';
        if (t === 'bid3' || t === 'bid 3') return 'BID 3';
        if (t === 'bidhearts' || t === 'bid hearts') return 'BID HEARTS';
        if (t === '4ornil' || t === '4 or nil') return '4 OR NIL';
        if (t === 'crazyaces' || t === 'crazy aces') return 'CRAZY ACES';
        return 'REG';
      })(),
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

    // Sign a short-lived JWT so the API accepts this request
    const token = jwt.sign({ userId: hostUser.id }, process.env.JWT_SECRET || '', { expiresIn: '5m' } as any);
    
    // Make API call to create game
    const response = await fetch(`${INTERNAL_API_URL}/api/games`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(gameData)
    });
    
    if (response.ok) {
      const game = await response.json() as any;
      const gameUrl = `https://bux-spades.pro/table/${game.id}`;
      
      // Ping all players
      const playerMentions = gameLine.players.map(p => `<@${p.userId}>`).join(' ');
      
      // Build game line format: "100k Partners 100/-100 Regular nil tick bn cross"
      const formatCoins = (amount: number) => amount >= 1000000 ? `${amount / 1000000}M` : `${amount / 1000}k`;
      let gameLineFormat = `${gameLine.coins >= 1000000 ? `${gameLine.coins / 1000000}M` : `${gameLine.coins / 1000}k`} ${gameLine.gameMode.charAt(0).toUpperCase() + gameLine.gameMode.slice(1)} ${gameLine.maxPoints}/${gameLine.minPoints} ${gameLine.gameType.charAt(0).toUpperCase() + gameLine.gameType.slice(1)}`;
      
      // Add nil and blind nil indicators
      if (gameLine.gameType === 'regular') {
        gameLineFormat += ` nil ${gameLine.nil === 'yes' ? '☑️' : '❌'} bn ${gameLine.blindNil === 'yes' ? '☑️' : '❌'}`;
      }
      
      // Build team info
      const teamInfo = gameLine.players.map((p: any) => {
        const team = p.seat === 0 || p.seat === 2 ? '🔴 Red Team' : '🔵 Blue Team';
        return `${team}: @${p.username}`;
      }).join('\n');
      
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('🎮 Table Up!')
        .setDescription(`**${gameLineFormat}**\n\n${teamInfo}\n\n**Please open your BUX Spades app, login with your Discord profile and you will be directed to your table...**\n\n**GOOD LUCK! 🍀**`)
        .setThumbnail('https://www.bux-spades.pro/bux-spades.png')
        .setTimestamp();
      
      await message.reply({ embeds: [embed] });
      
      // Remove game line from active list
      activeGameLines.delete(message.id);
      channelToOpenLine.delete(gameLine.channelId);
      if (gameLine.timeout) clearTimeout(gameLine.timeout);
      
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
  console.log('[DISCORD BOT] sendLeagueGameResults called with data:', gameData);
  console.log('[DISCORD BOT] Game line:', gameLine);
  
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = await guild.channels.fetch(RESULTS_CHANNEL_ID) as TextChannel;
    
    if (!channel) {
      console.error('Results channel not found');
      return;
    }
    
    // Use Discord IDs directly for mentions
    const winnersRaw = gameData.players.filter((p: any) => p.won);
    const losersRaw = gameData.players.filter((p: any) => !p.won);
    const winners = winnersRaw.map((p: any) => `<@${p.userId}>`);
    const losers = losersRaw.map((p: any) => `<@${p.userId}>`);
    
    // Calculate coins won with 10% rake
    // Partners: each winner gets 1.8x buy-in
    // Solo: 1st gets 2.6x buy-in, 2nd gets 1x buy-in
    const buyIn = gameData.buyIn || 0;
    let coinsField = '';
    if (winnersRaw.length === 2) {
      const perWinner = Math.round(buyIn * 1.8);
      coinsField = `${formatCoins(perWinner)} each`;
    } else if (winnersRaw.length === 1) {
      const first = Math.round(buyIn * 2.6);
      const second = Math.round(buyIn * 1.0);
      coinsField = `1st: ${formatCoins(first)} | 2nd: ${formatCoins(second)}`;
    } else {
      const totalPot = buyIn * gameData.players.length;
      const rake = Math.floor(totalPot * 0.1);
      const prizePool = totalPot - rake;
      coinsField = `${formatCoins(prizePool)}`;
    }
    
    const resultsEmbed = new EmbedBuilder()
      .setTitle('🏆 League Game Results')
      .setDescription(`**${gameLine}**`)
      .setThumbnail('https://www.bux-spades.pro/bux-spades.png')
      .addFields(
        { name: '🥇 Winners', value: winners.join(', '), inline: true },
        { name: '💰 Coins Won', value: coinsField, inline: true },
        { name: '🥈 Losers', value: losers.join(', '), inline: true }
      )
      .setColor(0x00ff00)
      .setTimestamp();

    // Add final scores if available
    if (gameData.team1Score !== undefined && gameData.team2Score !== undefined) {
      resultsEmbed.addFields(
        { name: '📊 Final Score', value: `Team 1: ${gameData.team1Score} | Team 2: ${gameData.team2Score}`, inline: false }
      );
    }
    
    await channel.send({ embeds: [resultsEmbed] });
    console.log('Sent league game results to Discord');
  } catch (error) {
    console.error('Error sending league game results:', error);
  }
}

// Helper to format coin values
function formatCoins(amount: number): string {
  return amount >= 1_000_000 ? `${amount / 1_000_000}M` : `${Math.round(amount / 1000)}k`;
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
    try {
      // Test database connection first
      console.log('[DISCORD BOT] Testing database connection...');
      await prisma.$queryRaw`SELECT 1`;
      console.log('[DISCORD BOT] Database connection successful');
      
    await loadVerifiedUsersFromDatabase();
    } catch (dbError) {
      console.warn('Database error during startup - Discord bot will continue without verified users:', dbError);
      console.warn('The bot will still function, but verified users will need to be loaded manually');
    }
  }).catch((error) => {
    console.error('Failed to start Discord bot:', error);
    console.log('Discord bot will not be available');
  });
} else {
  console.log('Discord bot token not provided, bot will not start');
}

export default client; 