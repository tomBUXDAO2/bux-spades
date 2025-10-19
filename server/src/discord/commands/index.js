import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
// CONSOLIDATED: GameManager removed - using GameService directly
import { DetailedStatsService } from '../../services/DetailedStatsService.js';
import { prisma } from '../../config/database.js';

// Room IDs
const LOW_ROOM_ID = '1404937454938619927';
const HIGH_ROOM_ID = '1403844895445221445';

// In-memory storage for game lines (before table creation)
const gameLines = new Map();

// Command registry
export const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('game')
      .setDescription('Create a REGULAR league game line')
      .addIntegerOption(option =>
        option.setName('mode')
          .setDescription('Game mode')
          .setRequired(true)
          .addChoices(
            { name: 'Partners', value: 1 },
            { name: 'Solo', value: 2 }
          )
      )
      .addIntegerOption(option =>
        option.setName('coins')
          .setDescription('Buy-in amount (Low: 100k-900k, High: 1M-10M)')
          .setRequired(true)
          .addChoices(
            { name: '100k', value: 100000 },
            { name: '200k', value: 200000 },
            { name: '300k', value: 300000 },
            { name: '400k', value: 400000 },
            { name: '500k', value: 500000 },
            { name: '600k', value: 600000 },
            { name: '700k', value: 700000 },
            { name: '800k', value: 800000 },
            { name: '900k', value: 900000 },
            { name: '1M', value: 1000000 },
            { name: '2M', value: 2000000 },
            { name: '3M', value: 3000000 },
            { name: '4M', value: 4000000 },
            { name: '5M', value: 5000000 },
            { name: '6M', value: 6000000 },
            { name: '7M', value: 7000000 },
            { name: '8M', value: 8000000 },
            { name: '9M', value: 9000000 },
            { name: '10M', value: 10000000 }
          )
      )
      .addIntegerOption(option =>
        option.setName('minpoints')
          .setDescription('Minimum points (default: -100)')
          .setRequired(false)
          .addChoices(
            { name: '-250', value: -250 },
            { name: '-200', value: -200 },
            { name: '-150', value: -150 },
            { name: '-100', value: -100 }
          )
      )
      .addIntegerOption(option =>
        option.setName('maxpoints')
          .setDescription('Maximum points (default: 500)')
          .setRequired(false)
          .addChoices(
            { name: '100', value: 100 },
            { name: '150', value: 150 },
            { name: '200', value: 200 },
            { name: '250', value: 250 },
            { name: '300', value: 300 },
            { name: '350', value: 350 },
            { name: '400', value: 400 },
            { name: '450', value: 450 },
            { name: '500', value: 500 },
            { name: '550', value: 550 },
            { name: '600', value: 600 },
            { name: '650', value: 650 }
          )
      )
      .addStringOption(option =>
        option.setName('special')
          .setDescription('Special rules (default: None)')
          .setRequired(false)
          .addChoices(
            { name: 'None', value: 'NONE' },
            { name: 'Screamer', value: 'SCREAMER' },
            { name: 'Assassin', value: 'ASSASSIN' }
          )
      )
      .addStringOption(option =>
        option.setName('nil')
          .setDescription('Allow Nil bids (default: On)')
          .setRequired(false)
          .addChoices(
            { name: 'On', value: 'true' },
            { name: 'Off', value: 'false' }
          )
      )
      .addStringOption(option =>
        option.setName('blindnil')
          .setDescription('Allow Blind Nil bids (default: Off)')
          .setRequired(false)
          .addChoices(
            { name: 'On', value: 'true' },
            { name: 'Off', value: 'false' }
          )
      ),
    execute: (interaction) => createGameLine(interaction, 'REGULAR')
  },
  {
    data: new SlashCommandBuilder()
      .setName('whiz')
      .setDescription('Create a WHIZ league game line')
      .addIntegerOption(option =>
        option.setName('mode')
          .setDescription('Game mode')
          .setRequired(true)
          .addChoices(
            { name: 'Partners', value: 1 },
            { name: 'Solo', value: 2 }
          )
      )
      .addIntegerOption(option =>
        option.setName('coins')
          .setDescription('Buy-in amount (Low: 100k-900k, High: 1M-10M)')
          .setRequired(true)
          .addChoices(
            { name: '100k', value: 100000 },
            { name: '200k', value: 200000 },
            { name: '300k', value: 300000 },
            { name: '400k', value: 400000 },
            { name: '500k', value: 500000 },
            { name: '600k', value: 600000 },
            { name: '700k', value: 700000 },
            { name: '800k', value: 800000 },
            { name: '900k', value: 900000 },
            { name: '1M', value: 1000000 },
            { name: '2M', value: 2000000 },
            { name: '3M', value: 3000000 },
            { name: '4M', value: 4000000 },
            { name: '5M', value: 5000000 },
            { name: '6M', value: 6000000 },
            { name: '7M', value: 7000000 },
            { name: '8M', value: 8000000 },
            { name: '9M', value: 9000000 },
            { name: '10M', value: 10000000 }
          )
      )
      .addIntegerOption(option =>
        option.setName('minpoints')
          .setDescription('Minimum points (default: -100)')
          .setRequired(false)
          .addChoices(
            { name: '-250', value: -250 },
            { name: '-200', value: -200 },
            { name: '-150', value: -150 },
            { name: '-100', value: -100 }
          )
      )
      .addIntegerOption(option =>
        option.setName('maxpoints')
          .setDescription('Maximum points (default: 500)')
          .setRequired(false)
          .addChoices(
            { name: '100', value: 100 },
            { name: '150', value: 150 },
            { name: '200', value: 200 },
            { name: '250', value: 250 },
            { name: '300', value: 300 },
            { name: '350', value: 350 },
            { name: '400', value: 400 },
            { name: '450', value: 450 },
            { name: '500', value: 500 },
            { name: '550', value: 550 },
            { name: '600', value: 600 },
            { name: '650', value: 650 }
          )
      )
      .addStringOption(option =>
        option.setName('special')
          .setDescription('Special rules (default: None)')
          .setRequired(false)
          .addChoices(
            { name: 'None', value: 'NONE' },
            { name: 'Screamer', value: 'SCREAMER' },
            { name: 'Assassin', value: 'ASSASSIN' }
          )
      ),
    execute: (interaction) => createGameLine(interaction, 'WHIZ')
  },
  {
    data: new SlashCommandBuilder()
      .setName('mirror')
      .setDescription('Create a MIRROR league game line')
      .addIntegerOption(option =>
        option.setName('mode')
          .setDescription('Game mode')
          .setRequired(true)
          .addChoices(
            { name: 'Partners', value: 1 },
            { name: 'Solo', value: 2 }
          )
      )
      .addIntegerOption(option =>
        option.setName('coins')
          .setDescription('Buy-in amount (Low: 100k-900k, High: 1M-10M)')
          .setRequired(true)
          .addChoices(
            { name: '100k', value: 100000 },
            { name: '200k', value: 200000 },
            { name: '300k', value: 300000 },
            { name: '400k', value: 400000 },
            { name: '500k', value: 500000 },
            { name: '600k', value: 600000 },
            { name: '700k', value: 700000 },
            { name: '800k', value: 800000 },
            { name: '900k', value: 900000 },
            { name: '1M', value: 1000000 },
            { name: '2M', value: 2000000 },
            { name: '3M', value: 3000000 },
            { name: '4M', value: 4000000 },
            { name: '5M', value: 5000000 },
            { name: '6M', value: 6000000 },
            { name: '7M', value: 7000000 },
            { name: '8M', value: 8000000 },
            { name: '9M', value: 9000000 },
            { name: '10M', value: 10000000 }
          )
      )
      .addIntegerOption(option =>
        option.setName('minpoints')
          .setDescription('Minimum points (default: -100)')
          .setRequired(false)
          .addChoices(
            { name: '-250', value: -250 },
            { name: '-200', value: -200 },
            { name: '-150', value: -150 },
            { name: '-100', value: -100 }
          )
      )
      .addIntegerOption(option =>
        option.setName('maxpoints')
          .setDescription('Maximum points (default: 500)')
          .setRequired(false)
          .addChoices(
            { name: '100', value: 100 },
            { name: '150', value: 150 },
            { name: '200', value: 200 },
            { name: '250', value: 250 },
            { name: '300', value: 300 },
            { name: '350', value: 350 },
            { name: '400', value: 400 },
            { name: '450', value: 450 },
            { name: '500', value: 500 },
            { name: '550', value: 550 },
            { name: '600', value: 600 },
            { name: '650', value: 650 }
          )
      )
      .addStringOption(option =>
        option.setName('special')
          .setDescription('Special rules (default: None)')
          .setRequired(false)
          .addChoices(
            { name: 'None', value: 'NONE' },
            { name: 'Screamer', value: 'SCREAMER' },
            { name: 'Assassin', value: 'ASSASSIN' }
          )
      ),
    execute: (interaction) => createGameLine(interaction, 'MIRROR')
  },
  {
    data: new SlashCommandBuilder()
      .setName('gimmick')
      .setDescription('Create a GIMMICK league game line')
      .addIntegerOption(option =>
        option.setName('mode')
          .setDescription('Game mode')
          .setRequired(true)
          .addChoices(
            { name: 'Partners', value: 1 },
            { name: 'Solo', value: 2 }
          )
      )
      .addIntegerOption(option =>
        option.setName('coins')
          .setDescription('Buy-in amount (Low: 100k-900k, High: 1M-10M)')
          .setRequired(true)
          .addChoices(
            { name: '100k', value: 100000 },
            { name: '200k', value: 200000 },
            { name: '300k', value: 300000 },
            { name: '400k', value: 400000 },
            { name: '500k', value: 500000 },
            { name: '600k', value: 600000 },
            { name: '700k', value: 700000 },
            { name: '800k', value: 800000 },
            { name: '900k', value: 900000 },
            { name: '1M', value: 1000000 },
            { name: '2M', value: 2000000 },
            { name: '3M', value: 3000000 },
            { name: '4M', value: 4000000 },
            { name: '5M', value: 5000000 },
            { name: '6M', value: 6000000 },
            { name: '7M', value: 7000000 },
            { name: '8M', value: 8000000 },
            { name: '9M', value: 9000000 },
            { name: '10M', value: 10000000 }
          )
      )
      .addStringOption(option =>
        option.setName('gimmicktype')
          .setDescription('Gimmick variant')
          .setRequired(true)
          .addChoices(
            { name: 'Suicide', value: 'SUICIDE' },
            { name: 'Bid 4 or Nil', value: 'BID4NIL' },
            { name: 'Bid 3', value: 'BID3' },
            { name: 'Bid Hearts', value: 'BIDHEARTS' },
            { name: 'Crazy Aces', value: 'CRAZY_ACES' }
          )
      )
      .addIntegerOption(option =>
        option.setName('minpoints')
          .setDescription('Minimum points (default: -100)')
          .setRequired(false)
          .addChoices(
            { name: '-250', value: -250 },
            { name: '-200', value: -200 },
            { name: '-150', value: -150 },
            { name: '-100', value: -100 }
          )
      )
      .addIntegerOption(option =>
        option.setName('maxpoints')
          .setDescription('Maximum points (default: 500)')
          .setRequired(false)
          .addChoices(
            { name: '100', value: 100 },
            { name: '150', value: 150 },
            { name: '200', value: 200 },
            { name: '250', value: 250 },
            { name: '300', value: 300 },
            { name: '350', value: 350 },
            { name: '400', value: 400 },
            { name: '450', value: 450 },
            { name: '500', value: 500 },
            { name: '550', value: 550 },
            { name: '600', value: 600 },
            { name: '650', value: 650 }
          )
      )
      .addStringOption(option =>
        option.setName('special')
          .setDescription('Special rules (default: None)')
          .setRequired(false)
          .addChoices(
            { name: 'None', value: 'NONE' },
            { name: 'Screamer', value: 'SCREAMER' },
            { name: 'Assassin', value: 'ASSASSIN' }
          )
      ),
    execute: (interaction) => createGameLine(interaction, 'GIMMICK')
  },
  {
    data: new SlashCommandBuilder()
      .setName('regulartournament')
      .setDescription('Create a REGULAR tournament')
      .addStringOption(option =>
        option.setName('name')
          .setDescription('Tournament name')
          .setRequired(true)
      )
      .addIntegerOption(option =>
        option.setName('mode')
          .setDescription('Game mode')
          .setRequired(true)
          .addChoices(
            { name: 'Partners', value: 1 },
            { name: 'Solo', value: 2 }
          )
      )
      .addIntegerOption(option =>
        option.setName('coins')
          .setDescription('Buy-in amount')
          .setRequired(true)
          .addChoices(
            { name: '100k', value: 100000 },
            { name: '200k', value: 200000 },
            { name: '300k', value: 300000 },
            { name: '400k', value: 400000 },
            { name: '500k', value: 500000 },
            { name: '600k', value: 600000 },
            { name: '700k', value: 700000 },
            { name: '800k', value: 800000 },
            { name: '900k', value: 900000 },
            { name: '1M', value: 1000000 },
            { name: '2M', value: 2000000 },
            { name: '3M', value: 3000000 },
            { name: '4M', value: 4000000 },
            { name: '5M', value: 5000000 },
            { name: '6M', value: 6000000 },
            { name: '7M', value: 7000000 },
            { name: '8M', value: 8000000 },
            { name: '9M', value: 9000000 },
            { name: '10M', value: 10000000 }
          )
      )
      .addStringOption(option =>
        option.setName('starttime')
          .setDescription('Start time (e.g., "2025-10-15 19:00" or "tomorrow 7pm")')
          .setRequired(true)
      )
      .addIntegerOption(option =>
        option.setName('minpoints')
          .setDescription('Minimum points to win (default: -100)')
          .setRequired(false)
      )
      .addIntegerOption(option =>
        option.setName('maxpoints')
          .setDescription('Maximum points to lose (default: 500)')
          .setRequired(false)
      )
      .addBooleanOption(option =>
        option.setName('nilallowed')
          .setDescription('Allow nil bids (default: true)')
          .setRequired(false)
      )
      .addBooleanOption(option =>
        option.setName('blindnilallowed')
          .setDescription('Allow blind nil bids (default: false)')
          .setRequired(false)
      ),
    execute: (interaction) => createTournament(interaction, 'REGULAR')
  },
  {
    data: new SlashCommandBuilder()
      .setName('facebookhelp')
      .setDescription('Post Facebook connection instructions'),
    execute: async (interaction) => {
      const embed = new EmbedBuilder()
        .setTitle('🔗 How to Get the LEAGUE Role')
        .setDescription(
          '**To access league game rooms, you need the LEAGUE role!**\n\n' +
          '**Step 1: Connect Facebook**\n' +
          '1️⃣ Go to **User Settings** (gear icon) in Discord\n' +
          '2️⃣ Click **Connections** in the left sidebar\n' +
          '3️⃣ Click **Connect** next to Facebook\n' +
          '4️⃣ Log in to your Facebook account and authorize Discord\n\n' +
          '**Step 2: Enable Profile Display**\n' +
          '1️⃣ After connecting, make sure **"Display on profile"** is **ON** ✅\n' +
          '2️⃣ This allows others to see your Facebook name on your Discord profile\n\n' +
          '**Step 3: Get the LEAGUE Role**\n' +
          '1️⃣ Go to **Server Settings** (right-click server name)\n' +
          '2️⃣ Click **Linked Roles** in the left sidebar\n' +
          '3️⃣ Click **Connect** next to the LEAGUE role requirement\n' +
          '4️⃣ If you have Facebook connected with "Display on profile" enabled, you\'ll automatically get the role!\n\n' +
          '**✅ You\'re all set!** You now have access to league game rooms and can use `/game`, `/whiz`, `/mirror`, and `/gimmick` commands!'
        )
        .setColor(0x0099ff)
        .setTimestamp()
        .setFooter({ text: 'Need help? Contact a moderator!' });

      await interaction.reply({
        embeds: [embed]
      });
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('postfacebookhelp')
      .setDescription('Post Facebook instructions to the help channel (Admin only)'),
    execute: async (interaction) => {
      // Check if user is admin
      const adminIds = process.env.DISCORD_ADMIN_IDS?.split(',') || [];
      if (!adminIds.includes(interaction.user.id)) {
        await interaction.reply({
          content: '❌ This command is only available to administrators.',
          ephemeral: true
        });
        return;
      }

      const helpChannelId = '1403960351107715073';
      
      const embed = new EmbedBuilder()
        .setTitle('🔗 How to Get the LEAGUE Role')
        .setDescription(
          '**To access league game rooms, you need the LEAGUE role!**\n\n' +
          '**Step 1: Connect Facebook**\n' +
          '1️⃣ Go to **User Settings** (gear icon) in Discord\n' +
          '2️⃣ Click **Connections** in the left sidebar\n' +
          '3️⃣ Click **Connect** next to Facebook\n' +
          '4️⃣ Log in to your Facebook account and authorize Discord\n\n' +
          '**Step 2: Enable Profile Display**\n' +
          '1️⃣ After connecting, make sure **"Display on profile"** is **ON** ✅\n' +
          '2️⃣ This allows others to see your Facebook name on your Discord profile\n\n' +
          '**Step 3: Get the LEAGUE Role**\n' +
          '1️⃣ Go to **Server Settings** (right-click server name)\n' +
          '2️⃣ Click **Linked Roles** in the left sidebar\n' +
          '3️⃣ Click **Connect** next to the LEAGUE role requirement\n' +
          '4️⃣ If you have Facebook connected with "Display on profile" enabled, you\'ll automatically get the role!\n\n' +
          '**✅ You\'re all set!** You now have access to league game rooms and can use `/game`, `/whiz`, `/mirror`, and `/gimmick` commands!'
        )
        .setColor(0x0099ff)
        .setTimestamp()
        .setFooter({ text: 'Need help? Contact a moderator!' });

      try {
        const channel = await interaction.client.channels.fetch(helpChannelId);
        await channel.send({ embeds: [embed] });
        
        await interaction.reply({
          content: `✅ Successfully posted Facebook help instructions to <#${helpChannelId}>!`,
          ephemeral: true
        });
      } catch (error) {
        console.error('Error posting to help channel:', error);
        await interaction.reply({
          content: `❌ Failed to post to help channel. Error: ${error.message}`,
          ephemeral: true
        });
      }
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('stats')
      .setDescription('Get league statistics for a user')
      .addUserOption(option =>
        option.setName('user')
          .setDescription('User to get stats for (defaults to you)')
          .setRequired(false)
      ),
    execute: getStats
  },
  {
    data: new SlashCommandBuilder()
      .setName('pay')
      .setDescription('Admin command: Pay coins to a user')
      .addUserOption(option =>
        option.setName('user')
          .setDescription('User to pay coins to')
          .setRequired(true)
      )
      .addIntegerOption(option =>
        option.setName('amount')
          .setDescription('Amount of coins to pay')
          .setRequired(true)
          .setMinValue(1)
      ),
    execute: payUser
  }
];

// Export modal submit handler
export async function handleModalSubmit(interaction) {
  try {
    const customId = interaction.customId;
    
    if (customId.startsWith('tournament_modal_')) {
      await handleTournamentModal(interaction);
    }
  } catch (error) {
    console.error('[DISCORD] Error handling modal submit:', error);
    await interaction.reply({
      content: '❌ An error occurred. Please try again.',
      ephemeral: true
    });
  }
}

// Export button handler for interaction handling
export async function handleButtonInteraction(interaction) {
  try {
    const customId = interaction.customId;
    
    // Handle tournament buttons
    if (customId.startsWith('register_tournament_') || customId.startsWith('cancel_registration_')) {
      await handleTournamentButton(interaction);
      return;
    }
    
    // Handle game line buttons
    // customId format: "action_gameLineId" where gameLineId itself contains underscores
    // So we split on first underscore only
    const [action, ...gameLineIdParts] = customId.split('_');
    const gameLineId = gameLineIdParts.join('_');
    const gameLine = gameLines.get(gameLineId);
    
    if (!gameLine) {
      console.log(`[DISCORD] Game line ${gameLineId} not found. Available lines:`, Array.from(gameLines.keys()));
      return interaction.reply({ 
        content: '❌ Game line not found or has expired. (This can happen if the server restarted. Please create a new game line.)', 
        ephemeral: true 
      });
    }

    const userId = interaction.user.id;

    if (action === 'join') {
      await handleJoinGame(interaction, gameLine, gameLineId);
    } else if (action === 'leave') {
      await handleLeaveGame(interaction, gameLine, gameLineId);
    } else if (action === 'cancel') {
      await handleCancelGame(interaction, gameLine, gameLineId);
    }
  } catch (error) {
    console.error('[DISCORD] Error handling button interaction:', error);
    await interaction.reply({ 
      content: '❌ An error occurred. Please try again.', 
      ephemeral: true 
    });
  }
}

// Command implementations
async function createGameLine(interaction, format) {
  try {
    // Defer reply to prevent timeout
    await interaction.deferReply();
    
    // Validate user exists and has enough coins
    const userValidation = await validateUserForGame(interaction.user.id, interaction.options.getInteger('coins'));
    if (!userValidation.valid) {
      return interaction.editReply({ 
        content: userValidation.message
      });
    }
    
    const channelId = interaction.channel.id;
    const coins = interaction.options.getInteger('coins');
    const modeValue = interaction.options.getInteger('mode');
    const mode = modeValue === 1 ? 'PARTNERS' : 'SOLO';
    const minPoints = interaction.options.getInteger('minpoints') || -100;
    const maxPoints = interaction.options.getInteger('maxpoints') || 500;
    const specialRule = interaction.options.getString('special') || 'NONE';
    
    // Gimmick variant (only for /gimmick command)
    const gimmickVariant = format === 'GIMMICK' ? interaction.options.getString('gimmicktype') : null;
    
    // Debug logging for gimmick variant
    if (format === 'GIMMICK') {
      console.log(`[GIMMICK DEBUG] Variant received: ${gimmickVariant}`);
      console.log(`[GIMMICK DEBUG] All options:`, interaction.options.data);
    }
    
    // Nil settings (only for /game (REGULAR) command, others always true/false)
    let nilAllowed, blindNilAllowed;
    if (format === 'REGULAR') {
      nilAllowed = interaction.options.getString('nil') === 'false' ? false : true;
      blindNilAllowed = interaction.options.getString('blindnil') === 'true' ? true : false;
    } else {
      nilAllowed = true;  // Always on for WHIZ, MIRROR, GIMMICK
      blindNilAllowed = false;  // Always off for WHIZ, MIRROR, GIMMICK
    }

    // Debug logging
    console.log(`[DISCORD] Received /${interaction.commandName} command with options:`, {
      coins,
      mode,
      format,
      minPoints,
      maxPoints,
      gimmickVariant,
      specialRule,
      nilAllowed,
      blindNilAllowed
    });

    // Validate coins based on room
    const validCoins = validateCoins(channelId, coins);
    if (!validCoins) {
      const isLowRoom = channelId === LOW_ROOM_ID;
      const range = isLowRoom ? '100k-900k (100k increments)' : '1M-10M (1M increments)';
      return interaction.reply({ 
        content: `❌ Invalid coin amount for this room. Valid range: ${range}`, 
        ephemeral: true 
      });
    }

    // Validate gimmick variant if format is GIMMICK
    if (format === 'GIMMICK' && !gimmickVariant) {
      return interaction.reply({ 
        content: '❌ You must select a gimmick variant when using Gimmick format.', 
        ephemeral: true 
      });
    }

    // Validate Suicide is partners only
    if (gimmickVariant === 'SUICIDE' && mode !== 'PARTNERS') {
      return interaction.reply({ 
        content: '❌ Suicide variant is only available in Partners mode.', 
        ephemeral: true 
      });
    }

    // Create game line
    const gameLineId = `line_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const gameLine = {
      id: gameLineId,
      channelId,
      messageId: null, // Will be set after reply
      createdBy: interaction.user.id,
      createdAt: new Date(),
      settings: {
        coins,
        mode,
        format,
        minPoints,
      maxPoints,
        gimmickVariant,
        specialRule,
        nilAllowed,
        blindNilAllowed
      },
      players: [
        { discordId: interaction.user.id, username: interaction.user.username, seat: 0 } // Host in seat 0
      ]
    };

    gameLines.set(gameLineId, gameLine);

    // Create embed
    const embed = createGameLineEmbed(gameLine);
    const buttons = createGameLineButtons(gameLineId, false);

    const response = await interaction.editReply({ 
      content: '<@&1403953667501195284>',
      embeds: [embed],
      components: [buttons],
      allowedMentions: { roles: ['1403953667501195284'] }
    });

    // Store message ID for later updates
    gameLine.messageId = response.id;
    gameLines.set(gameLineId, gameLine);

    console.log(`[DISCORD] Game line created: ${gameLineId}`);
  } catch (error) {
    console.error('[DISCORD] Error creating game line:', error);
    if (interaction.deferred) {
      await interaction.editReply({ 
        content: '❌ Failed to create game line. Please try again.'
      });
    } else {
    await interaction.reply({ 
        content: '❌ Failed to create game line. Please try again.', 
      ephemeral: true 
    });
    }
  }
}




async function getStats(interaction) {
  try {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    
    // Get user by Discord ID
    const user = await prisma.user.findUnique({
      where: { discordId: targetUser.id }
    });

    if (!user) {
      return interaction.reply({ 
        content: '❌ User not found in database.', 
        ephemeral: true 
      });
    }

    // Get league-only stats using DetailedStatsService
    const stats = await DetailedStatsService.getUserStats(user.id, {
      mode: 'ALL',
      format: 'ALL',
      isLeague: true  // Only league games
    });

    // Create embed with league stats
    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${targetUser.username}'s League Stats`)
      .setThumbnail(targetUser.displayAvatarURL())
      .setColor(0x0099ff)
      .setTimestamp();

    // Main stats section
    embed.addFields(
      { 
        name: '🎮 **LEAGUE STATS**', 
        value: `**Played:** ${stats.totalGames}\n**Won:** ${stats.gamesWon}\n**Win %:** ${stats.winRate.toFixed(1)}%\n**Total bags:** ${stats.bags.total}\n**Bags per game:** ${stats.bags.perGame.toFixed(1)}`, 
        inline: false 
      }
    );

    // Mode breakdown if available
    if (stats.modeBreakdown) {
      const partners = stats.modeBreakdown.partners || { played: 0, won: 0, winRate: 0 };
      const solo = stats.modeBreakdown.solo || { played: 0, won: 0, winRate: 0 };
      
      embed.addFields(
        { 
          name: '🤝 **Partners**', 
          value: `Played: ${partners.played} | Won: ${partners.won} | Win %: ${partners.winRate.toFixed(1)}%`, 
          inline: true 
        },
        { 
          name: '👤 **Solo**', 
          value: `Played: ${solo.played} | Won: ${solo.won} | Win %: ${solo.winRate.toFixed(1)}%`, 
          inline: true 
        }
      );
    }

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('[DISCORD] Error getting stats:', error);
    await interaction.reply({ 
      content: '❌ Failed to get user statistics.', 
      ephemeral: true 
    });
  }
}

async function payUser(interaction) {
  try {
    // Check if user is admin
    const adminUserIds = process.env.DISCORD_ADMIN_IDS?.split(',') || [];
    if (!adminUserIds.includes(interaction.user.id)) {
      return interaction.reply({ 
        content: '❌ You do not have permission to use this command.', 
        ephemeral: true 
      });
    }

    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    // Find user by Discord ID
    const user = await prisma.user.findUnique({
      where: { discordId: targetUser.id }
    });

    if (!user) {
      return interaction.reply({ 
        content: '❌ User not found in database.', 
        ephemeral: true 
      });
    }

    // Update user's coins
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { 
        coins: { increment: amount }
      }
    });

    const embed = new EmbedBuilder()
      .setTitle('💰 Payment Processed')
      .addFields(
        { name: 'Amount', value: `${amount.toLocaleString()} coins`, inline: true },
        { name: 'Recipient', value: `<@${targetUser.id}>`, inline: true },
        { name: 'New Balance', value: `${updatedUser.coins.toLocaleString()} coins`, inline: true },
        { name: 'Processed by', value: `<@${interaction.user.id}>`, inline: false }
      )
      .setColor(0x00ff00)
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('[DISCORD] Error processing payment:', error);
    await interaction.reply({ 
      content: '❌ Failed to process payment.', 
      ephemeral: true 
    });
  }
}

// Helper functions for game lines
async function validateUserForGame(discordId, requiredCoins) {
  try {
    // Check if user exists in database
    const user = await prisma.user.findUnique({
      where: { discordId: discordId },
      select: { id: true, coins: true, username: true }
    });

    if (!user) {
      return {
        valid: false,
        message: '❌ You need to create an account first!\n\nPlease visit **https://www.bux-spades.pro** and login with Discord before creating or joining game lines.'
      };
    }

    // Check if user has enough coins
    if (user.coins < requiredCoins) {
      const coinsDisplay = requiredCoins >= 1000000 
        ? `${requiredCoins / 1000000}M` 
        : `${requiredCoins / 1000}k`;
      
      return {
        valid: false,
        message: `❌ Insufficient coins!\n\nYou need **${coinsDisplay}** coins to join this game, but you only have **${user.coins.toLocaleString()}** coins.\n\n💡 **Options:**\n• Play games with lower coin amounts\n• Open a ticket in Discord to purchase more coins`
      };
    }

    return {
      valid: true,
      user: user
    };
  } catch (error) {
    console.error('[DISCORD] Error validating user:', error);
    return {
      valid: false,
      message: '❌ Error checking your account. Please try again later.'
    };
  }
}

function validateCoins(channelId, coins) {
  if (channelId === LOW_ROOM_ID) {
    // Low room: 100k-900k in 100k increments
    return coins >= 100000 && coins <= 900000 && coins % 100000 === 0;
  } else if (channelId === HIGH_ROOM_ID) {
    // High room: 1M-10M in 1M increments
    return coins >= 1000000 && coins <= 10000000 && coins % 1000000 === 0;
  }
  return false;
}

function createGameLineEmbed(gameLineData) {
  const { settings, players, createdAt } = gameLineData;
  const { coins, mode, format, minPoints, maxPoints, gimmickVariant, specialRule, nilAllowed, blindNilAllowed } = settings;
  
  // Format coins (e.g., 100000 -> 100k, 1000000 -> 1mil)
  const coinsDisplay = coins >= 1000000 ? `${coins / 1000000}mil` : `${coins / 1000}k`;
  
  // Build game line with bold formatting
  let gameLineText = `**${coinsDisplay} ${mode} ${maxPoints}/${minPoints} ${format}`;
  
  // Add gimmick variant for GIMMICK games
  if (format === 'GIMMICK' && gimmickVariant) {
    gameLineText = `**${coinsDisplay} ${mode} ${maxPoints}/${minPoints} ${gimmickVariant}`;
  }
  
  // Add nil status for REGULAR games
  if (format === 'REGULAR') {
    gameLineText += `\nnil ${nilAllowed ? '☑️' : '❌'} bn ${blindNilAllowed ? '☑️' : '❌'}`;
  }
  
  // Add special rule if present
  if (specialRule) {
    gameLineText += `\n🎲 **${specialRule.toUpperCase()}**`;
  }
  
  gameLineText += '**'; // Close bold
  
  // Organize players by team or individual colors
  let playersText;
  const playersNeeded = 4 - players.length;
  const playersNeededText = playersNeeded > 0 ? `\n\n**${playersNeeded} more player${playersNeeded === 1 ? '' : 's'} needed**` : '';
  
  if (mode === 'SOLO') {
    // For SOLO games, show individual player colors
    const colorEmojis = ['🔴', '🔵', '🟠', '🟢']; // Red (0), Blue (1), Orange (2), Green (3)
    const seats = [0, 1, 2, 3];
    
    playersText = seats.map(seat => {
      const player = players.find(p => p.seat === seat);
      const emoji = colorEmojis[seat];
      return player ? `${emoji} • <@${player.discordId}>` : `${emoji} • _Empty_`;
    }).join('\n');
  } else {
    // For PARTNERS games, show teams
    const redTeam = players.filter(p => p.seat === 0 || p.seat === 2);
    const blueTeam = players.filter(p => p.seat === 1 || p.seat === 3);
    
    const redTeamText = redTeam.length > 0 
      ? redTeam.map(p => `• <@${p.discordId}>`).join('\n')
      : '• _Empty_';
    
    const blueTeamText = blueTeam.length > 0
      ? blueTeam.map(p => `• <@${p.discordId}>`).join('\n')
      : '• _Empty_';
    
    playersText = `🔴 Red Team:\n${redTeamText}\n\n🔵 Blue Team:\n${blueTeamText}`;
  }
  
  const embed = new EmbedBuilder()
    .setTitle('🎮 GAME LINE')
    .setDescription(gameLineText)
    .addFields(
      { name: '👤 Host', value: `<@${gameLineData.createdBy}>`, inline: true },
      { name: '👥 Players', value: `${players.length}/4`, inline: true },
      { name: '⏰ Created', value: `<t:${Math.floor(createdAt.getTime() / 1000)}:R>`, inline: true },
      { name: '🎯 Current Players', value: `${playersText}${playersNeededText}`, inline: false }
    )
    .setColor(0x00ff00)
    .setTimestamp();

  return embed;
}

function createGameLineButtons(gameLineId, isFull) {
  if (isFull) {
    return null; // No buttons when full
  }
  
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`join_${gameLineId}`)
        .setLabel('Join Game')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`leave_${gameLineId}`)
        .setLabel('Leave Game')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌'),
      new ButtonBuilder()
        .setCustomId(`cancel_${gameLineId}`)
        .setLabel('Cancel Game')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🚫')
    );

  return row;
}

async function handleJoinGame(interaction, gameLine, gameLineId) {
  const userId = interaction.user.id;
  
  // Validate user exists and has enough coins
  const userValidation = await validateUserForGame(userId, gameLine.settings.coins);
  if (!userValidation.valid) {
    return interaction.reply({ 
      content: userValidation.message, 
      ephemeral: true 
    });
  }
  
  // Check if already in line
  if (gameLine.players.some(p => p.discordId === userId)) {
    return interaction.reply({ 
      content: '❌ You are already in this game line.', 
      ephemeral: true 
    });
  }
  
  // Check if line is full
  if (gameLine.players.length >= 4) {
    return interaction.reply({ 
      content: '❌ This game line is already full.', 
      ephemeral: true 
    });
  }
  
  // Assign seat based on join order: 0 (host), 2 (partner), 1 (opponent), 3 (opponent partner)
  const seatOrder = [0, 2, 1, 3];
  const seat = seatOrder[gameLine.players.length];
  
  // Add player
  gameLine.players.push({
    discordId: userId,
    username: interaction.user.username,
    seat
  });
  
  gameLines.set(gameLineId, gameLine);
  
  // Check if line is now full
  if (gameLine.players.length === 4) {
    await handleLineFull(interaction, gameLine, gameLineId);
  } else {
    // Update embed
    const embed = createGameLineEmbed(gameLine);
    const buttons = createGameLineButtons(gameLineId, false);
    
    await interaction.update({ 
      embeds: [embed],
      components: [buttons]
    });
  }
}

async function handleLeaveGame(interaction, gameLine, gameLineId) {
  const userId = interaction.user.id;
  
  // Check if in line
  const playerIndex = gameLine.players.findIndex(p => p.discordId === userId);
  if (playerIndex === -1) {
    return interaction.reply({ 
      content: '❌ You are not in this game line.', 
      ephemeral: true 
    });
  }
  
  // Can't leave if you're the host
  if (userId === gameLine.createdBy) {
    return interaction.reply({ 
      content: '❌ Host cannot leave. Use Cancel Game instead.', 
      ephemeral: true 
    });
  }
  
  // Remove player
  gameLine.players.splice(playerIndex, 1);
  gameLines.set(gameLineId, gameLine);
  
  // Update embed
  const embed = createGameLineEmbed(gameLine);
  const buttons = createGameLineButtons(gameLineId, false);
  
  await interaction.update({ 
    embeds: [embed],
    components: [buttons]
  });
}

async function handleCancelGame(interaction, gameLine, gameLineId) {
  const userId = interaction.user.id;
  
  // Only host or admin can cancel
  const adminIds = process.env.DISCORD_ADMIN_IDS?.split(',') || [];
  if (userId !== gameLine.createdBy && !adminIds.includes(userId)) {
    return interaction.reply({ 
      content: '❌ Only the host or an admin can cancel this game line.', 
      ephemeral: true 
    });
  }
  
  // Delete game line
  gameLines.delete(gameLineId);
  
  // Update embed to show cancelled
  const embed = new EmbedBuilder()
    .setTitle('🚫 GAME LINE - CANCELLED')
    .setDescription('This game line has been cancelled.')
    .setColor(0xff0000)
    .setTimestamp();
  
  await interaction.update({ 
    embeds: [embed],
    components: []
  });
}

async function handleLineFull(interaction, gameLine, gameLineId) {
  try {
    // Update original embed to show FULL
    const fullEmbed = new EmbedBuilder()
      .setTitle('🎮 GAME LINE - FULL')
      .setDescription(`${gameLine.settings.coins >= 1000000 ? `${gameLine.settings.coins / 1000000}mil` : `${gameLine.settings.coins / 1000}k`} ${gameLine.settings.mode} ${gameLine.settings.maxPoints}/${gameLine.settings.minPoints} ${gameLine.settings.format}`)
      .addFields(
        { name: '👤 Host', value: `<@${gameLine.createdBy}>`, inline: true },
        { name: '👥 Players', value: '4/4', inline: true },
        { name: '⏰ Created', value: `<t:${Math.floor(gameLine.createdAt.getTime() / 1000)}:R>`, inline: true }
      )
      .setColor(0x00ff00)
      .setFooter({ text: 'Game created! Check the reply above for details.' })
      .setTimestamp();
    
    await interaction.update({ 
      embeds: [fullEmbed],
      components: []
    });
    
    // Create game in database
    const gameId = await createGameFromLine(gameLine);
    
    // Set activeGameId for all players and emit socket event to force redirect
    const { default: redisSessionService } = await import('../../services/RedisSessionService.js');
    const { io } = await import('../../index.js');
    
    for (const player of gameLine.players) {
      // Find user by Discord ID
      const user = await prisma.user.findUnique({
        where: { discordId: player.discordId }
      });
      
      if (user) {
        // Update session with activeGameId
        await redisSessionService.updateActiveGame(user.id, gameId);
        console.log(`[DISCORD] Set activeGameId ${gameId} for user ${user.username}`);
        
        // Find user's socket and emit redirect event
        const session = await redisSessionService.getUserSession(user.id);
        if (session?.socketId) {
          const userSocket = io.sockets.sockets.get(session.socketId);
          if (userSocket) {
            console.log(`[DISCORD] Emitting force_redirect_to_table to ${user.username}`);
            userSocket.emit('force_redirect_to_table', { gameId });
          }
        }
      }
    }
    
    // Post "Table Up!" reply
    const redTeam = gameLine.players.filter(p => p.seat === 0 || p.seat === 2);
    const blueTeam = gameLine.players.filter(p => p.seat === 1 || p.seat === 3);
    
    const coinsDisplay = gameLine.settings.coins >= 1000000 ? `${gameLine.settings.coins / 1000000}mil` : `${gameLine.settings.coins / 1000}k`;
    let tableUpDesc = `${coinsDisplay} ${gameLine.settings.mode} ${gameLine.settings.maxPoints}/${gameLine.settings.minPoints} ${gameLine.settings.format}`;
    
    // Add special rule if present
    if (gameLine.settings.specialRule) {
      tableUpDesc += `\n🎲 **${gameLine.settings.specialRule.toUpperCase()}**`;
    }
    
    tableUpDesc += `\n\n🔴 Red Team: ${redTeam.map(p => `<@${p.discordId}>`).join(', ')}\n` +
                   `🔵 Blue Team: ${blueTeam.map(p => `<@${p.discordId}>`).join(', ')}\n\n` +
                   `Please open your BUX Spades app, login with your Discord profile and you will be directed to your table...\n\n` +
                   `GOOD LUCK! 🍀`;
    
    const tableUpEmbed = new EmbedBuilder()
      .setTitle('🎮 Table Up!')
      .setDescription(tableUpDesc)
      .setColor(0x0099ff)
      .setTimestamp();
    
    await interaction.followUp({ 
      content: '<@&1403953667501195284>',
      embeds: [tableUpEmbed],
      allowedMentions: { roles: ['1403953667501195284'] }
    });
    
    // Clean up game line from memory
    gameLines.delete(gameLineId);
    
    console.log(`[DISCORD] Table created for game line ${gameLineId}, game ID: ${gameId}`);
  } catch (error) {
    console.error('[DISCORD] Error handling full line:', error);
    await interaction.followUp({ 
      content: '❌ Error creating game table. Please contact an admin.', 
      ephemeral: true 
    });
  }
}

async function createGameFromLine(gameLine) {
  const { settings, players } = gameLine;
  const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Sort players by seat to ensure correct order
  const sortedPlayers = [...players].sort((a, b) => a.seat - b.seat);
    
    // Create game in database
    const game = await prisma.game.create({
      data: {
        id: gameId,
      createdById: gameLine.createdBy,
      mode: settings.mode,
      format: settings.format,
      gimmickVariant: settings.gimmickVariant || null,
        isLeague: true,
        isRated: true,
        status: 'WAITING',
      minPoints: settings.minPoints,
      maxPoints: settings.maxPoints,
      nilAllowed: settings.nilAllowed,
      blindNilAllowed: settings.blindNilAllowed,
      specialRules: settings.specialRule && settings.specialRule !== 'NONE' ? { specialRule: settings.specialRule } : null,
      buyIn: settings.coins,
        currentRound: 1,
        currentTrick: 0,
        currentPlayer: null,
        dealer: Math.floor(Math.random() * 4), // Random dealer 0-3
        createdAt: new Date()
      }
    });

  // Create game players for each Discord user in their assigned seats
  for (const player of sortedPlayers) {
      // Find or create user by Discord ID
      let user = await prisma.user.findUnique({
      where: { discordId: player.discordId }
      });
      
      if (!user) {
        // Create placeholder user for Discord ID
        user = await prisma.user.create({
          data: {
          discordId: player.discordId,
          username: player.username,
            avatarUrl: '/default-pfp.jpg',
          coins: 15000000, // Default coins
            createdAt: new Date()
          }
        });
      }
      
    // Add player to game in their assigned seat
      await prisma.gamePlayer.create({
        data: {
          gameId: game.id,
          userId: user.id,
        seatIndex: player.seat,
        teamIndex: player.seat % 2, // Seats 0,2 = team 0; seats 1,3 = team 1
          isHuman: true,
          isSpectator: false,
          joinedAt: new Date()
        }
      });
    }

    // Create Discord game record for tracking
    await prisma.discordGame.create({
      data: {
        gameId: game.id,
      channelId: gameLine.channelId,
      commandMessageId: gameLine.messageId,
      createdBy: gameLine.createdBy,
        status: 'WAITING',
        createdAt: new Date()
      }
    });

  console.log(`[DISCORD] Created game ${gameId} from line with players:`, sortedPlayers.map(p => `${p.username} (seat ${p.seat})`));
  
  // CONSOLIDATED: GameManager removed - using GameService + Redis directly
  try {
    const { GameService } = await import('../../services/GameService.js');
    const { default: redisGameState } = await import('../../services/RedisGameStateService.js');
    
    // Populate Redis cache with initial game state
    const fullGameState = await GameService.getGameStateForClient(gameId);
    if (fullGameState) {
      await redisGameState.setGameState(gameId, fullGameState);
      console.log(`[DISCORD] Populated Redis cache for game ${gameId}`);
    }
  } catch (error) {
    console.error(`[DISCORD] Error setting up game state:`, error);
  }
  
  return gameId;
}


// Tournament modal handler
async function handleTournamentModal(interaction) {
  try {
    const customId = interaction.customId;
    const tournamentId = customId.split('_').pop();
    const userId = interaction.user.id;
    const partnerName = interaction.fields.getTextInputValue('partner_name').trim();
    
    // Get user
    let user = await prisma.user.findUnique({
      where: { discordId: userId }
    });
    
    if (!user) {
      return interaction.reply({
        content: '❌ User not found. Please try again.',
        ephemeral: true
      });
    }
    
    // Get tournament
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { registrations: true }
    });
    
    if (!tournament) {
      return interaction.reply({
        content: '❌ Tournament not found.',
        ephemeral: true
      });
    }
    
    if (tournament.status !== 'REGISTRATION_OPEN') {
      return interaction.reply({
        content: '❌ Registration is closed for this tournament.',
        ephemeral: true
      });
    }
    
    // Check if already registered
    const existingRegistration = await prisma.tournamentRegistration.findUnique({
      where: {
        tournamentId_userId: {
          tournamentId,
          userId: user.id
        }
      }
    });
    
    if (existingRegistration) {
      return interaction.reply({
        content: '❌ You are already registered for this tournament.',
        ephemeral: true
      });
    }
    
    if (partnerName) {
      // Extract Discord ID from mention format <@USER_ID> or <@!USER_ID>
      let partnerDiscordId = null;
      const mentionMatch = partnerName.match(/<@!?(\d+)>/);
      if (mentionMatch) {
        partnerDiscordId = mentionMatch[1];
      }
      
      // Find partner by Discord ID (if mentioned) or username
      let partner;
      if (partnerDiscordId) {
        partner = await prisma.user.findUnique({
          where: { discordId: partnerDiscordId }
        });
      } else {
        // Search by username
        partner = await prisma.user.findFirst({
          where: {
            username: {
              contains: partnerName,
              mode: 'insensitive'
            }
          }
        });
      }
      
      if (!partner) {
        return interaction.reply({
          content: `❌ Partner "${partnerName}" not found in the server. Make sure they have played at least one game.`,
          ephemeral: true
        });
      }
      
      if (partner.id === user.id) {
        return interaction.reply({
          content: '❌ You cannot partner with yourself.',
          ephemeral: true
        });
      }
      
      // Check if partner is already registered
      const partnerRegistration = await prisma.tournamentRegistration.findUnique({
        where: {
          tournamentId_userId: {
            tournamentId,
            userId: partner.id
          }
        }
      });
      
      if (partnerRegistration) {
        return interaction.reply({
          content: `❌ ${partner.username} is already registered for this tournament.`,
          ephemeral: true
        });
      }
      
      // Register both players as a complete team
      await prisma.tournamentRegistration.createMany({
        data: [
          {
            tournamentId,
            userId: user.id,
            partnerId: partner.id,
            isComplete: true
          },
          {
            tournamentId,
            userId: partner.id,
            partnerId: user.id,
            isComplete: true
          }
        ]
      });
      
      await interaction.reply({
        content: `✅ Successfully registered with ${partner.username} for the tournament!`,
        ephemeral: true
      });
      
    } else {
      // Register without partner (will be auto-assigned later)
      await prisma.tournamentRegistration.create({
        data: {
          tournamentId,
          userId: user.id,
          isComplete: false
        }
      });
      
      await interaction.reply({
        content: '✅ Successfully registered for the tournament! You will be auto-assigned a partner when registration closes.',
        ephemeral: true
      });
    }
    
    await updateTournamentEmbed(interaction, tournamentId);
    
  } catch (error) {
    console.error('[TOURNAMENT] Error handling modal:', error);
    await interaction.reply({
      content: '❌ An error occurred. Please try again.',
      ephemeral: true
    });
  }
}

// Tournament button handler
async function handleTournamentButton(interaction) {
  try {
    const customId = interaction.customId;
    const tournamentId = customId.split('_').pop();
    const userId = interaction.user.id;
    
    // Get or create user
    let user = await prisma.user.findUnique({
      where: { discordId: userId }
    });
    
    if (!user) {
      user = await prisma.user.create({
        data: {
          discordId: userId,
          username: interaction.user.username,
          avatarUrl: interaction.user.avatarURL() || '/default-pfp.jpg',
          coins: 15000000 // Default coins
        }
      });
    }
    
    // Get tournament
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { registrations: true }
    });
    
    if (!tournament) {
      return interaction.reply({
        content: '❌ Tournament not found.',
        ephemeral: true
      });
    }
    
    if (tournament.status !== 'REGISTRATION_OPEN') {
      return interaction.reply({
        content: '❌ Registration is closed for this tournament.',
        ephemeral: true
      });
    }
    
    if (customId.startsWith('register_tournament_')) {
      // Check if already registered
      const existingRegistration = await prisma.tournamentRegistration.findUnique({
        where: {
          tournamentId_userId: {
            tournamentId,
            userId: user.id
          }
        }
      });
      
      if (existingRegistration) {
        return interaction.reply({
          content: '❌ You are already registered for this tournament.',
          ephemeral: true
        });
      }
      
      // Show modal for partner selection (for partners tournaments)
      if (tournament.mode === 'PARTNERS') {
        const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
        
        const modal = new ModalBuilder()
          .setCustomId(`tournament_modal_${tournamentId}`)
          .setTitle('Tournament Registration');
        
        const partnerInput = new TextInputBuilder()
          .setCustomId('partner_name')
          .setLabel('Partner Name (blank = auto-assign)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('Type @username or paste user mention');
        
        const actionRow = new ActionRowBuilder().addComponents(partnerInput);
        modal.addComponents(actionRow);
        
        await interaction.showModal(modal);
      } else {
        // Solo tournament - register directly
        await prisma.tournamentRegistration.create({
          data: {
            tournamentId,
            userId: user.id,
            isComplete: true
          }
        });
        
        await interaction.reply({
          content: '✅ Successfully registered for the tournament!',
          ephemeral: true
        });
        
        await updateTournamentEmbed(interaction, tournamentId);
      }
      
    } else if (customId.startsWith('cancel_registration_')) {
      // Cancel registration
      const registration = await prisma.tournamentRegistration.findUnique({
        where: {
          tournamentId_userId: {
            tournamentId,
            userId: user.id
          }
        },
        include: { partner: true }
      });
      
      if (!registration) {
        return interaction.reply({
          content: '❌ You are not registered for this tournament.',
          ephemeral: true
        });
      }
      
      // Remove both players if it's a complete team
      if (registration.isComplete && registration.partnerId) {
        await prisma.tournamentRegistration.deleteMany({
          where: {
            tournamentId,
            OR: [
              { userId: user.id },
              { userId: registration.partnerId }
            ]
          }
        });
      } else {
        await prisma.tournamentRegistration.delete({
          where: { id: registration.id }
        });
      }
      
      await interaction.reply({
        content: '✅ Registration cancelled.',
        ephemeral: true
      });
      
      await updateTournamentEmbed(interaction, tournamentId);
    }
    
  } catch (error) {
    console.error('[TOURNAMENT] Error handling button:', error);
    await interaction.reply({
      content: '❌ An error occurred. Please try again.',
      ephemeral: true
    });
  }
}

// Update tournament embed with current registration stats
async function updateTournamentEmbed(interaction, tournamentId) {
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { registrations: { include: { user: true } } }
    });
    
    if (!tournament) return;
    
    const completeTeams = tournament.registrations.filter(r => r.isComplete && r.partnerId).length;
    const needPartner = tournament.registrations.filter(r => !r.isComplete || !r.partnerId).length;
    
    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${tournament.name}`)
      .setDescription(
        `**📅 Starts:** <t:${Math.floor(tournament.startTime.getTime() / 1000)}:F>\n` +
        `**🎮 Mode:** ${tournament.mode}\n` +
        `**💰 Buy-in:** ${tournament.buyIn >= 1000000 ? `${tournament.buyIn / 1000000}M` : `${tournament.buyIn / 1000}k`} coins\n` +
        `**📊 Points:** ${tournament.minPoints} to ${tournament.maxPoints}\n` +
        `**🎯 Format:** ${tournament.format}\n` +
        `**🎲 Nils:** ${tournament.nilAllowed ? 'Allowed' : 'Not Allowed'}\n` +
        `**👁️ Blind Nils:** ${tournament.blindNilAllowed ? 'Allowed' : 'Not Allowed'}\n\n` +
        `**Teams:** ${completeTeams}\n` +
        `**Need a P:** ${needPartner}`
      )
      .setColor(0x0099ff)
      .setTimestamp();
    
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`register_tournament_${tournamentId}`)
          .setLabel('Register')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`cancel_registration_${tournamentId}`)
          .setLabel('Cancel Registration')
          .setStyle(ButtonStyle.Danger)
      );
    
    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
    
  } catch (error) {
    console.error('[TOURNAMENT] Error updating embed:', error);
  }
}

// Tournament creation function
async function createTournament(interaction, format) {
  try {
    // Check if user is admin
    const adminIds = process.env.DISCORD_ADMIN_IDS?.split(',') || [];
    if (!adminIds.includes(interaction.user.id)) {
      await interaction.reply({
        content: '❌ This command is only available to administrators.',
        ephemeral: true
      });
      return;
    }

    // Defer reply to prevent timeout
    await interaction.deferReply();

    const name = interaction.options.getString('name');
    const coins = interaction.options.getInteger('coins');
    const modeValue = interaction.options.getInteger('mode');
    const mode = modeValue === 1 ? 'PARTNERS' : 'SOLO';
    const minPoints = interaction.options.getInteger('minpoints') || -100;
    const maxPoints = interaction.options.getInteger('maxpoints') || 500;
    const nilAllowed = interaction.options.getBoolean('nilallowed') ?? true;
    const blindNilAllowed = interaction.options.getBoolean('blindnilallowed') ?? false;
    const startTimeStr = interaction.options.getString('starttime');

    // Parse start time
    let startTime;
    try {
      // Try parsing various formats
      if (startTimeStr.includes('tomorrow')) {
        const timeMatch = startTimeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        if (timeMatch) {
          let hours = parseInt(timeMatch[1]);
          const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
          const ampm = timeMatch[3]?.toLowerCase();
          
          if (ampm === 'pm' && hours !== 12) hours += 12;
          if (ampm === 'am' && hours === 12) hours = 0;
          
          startTime = new Date();
          startTime.setDate(startTime.getDate() + 1);
          startTime.setHours(hours, minutes, 0, 0);
        } else {
          throw new Error('Invalid time format');
        }
      } else {
        startTime = new Date(startTimeStr);
        if (isNaN(startTime.getTime())) {
          throw new Error('Invalid date format');
        }
      }
    } catch (error) {
      return interaction.editReply({
        content: '❌ Invalid start time format. Use formats like "2025-10-15 19:00" or "tomorrow 7pm"'
      });
    }

    // Validate start time is in the future
    if (startTime <= new Date()) {
      return interaction.editReply({
        content: '❌ Tournament start time must be in the future.'
      });
    }

    // Create tournament in database
    const tournament = await prisma.tournament.create({
      data: {
        name,
        mode,
        format,
        isRated: true,
        minPoints,
        maxPoints,
        nilAllowed,
        blindNilAllowed,
        buyIn: coins,
        startTime
      }
    });

    // Create tournament registration embed
    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${name}`)
      .setDescription(
        `**📅 Starts:** <t:${Math.floor(startTime.getTime() / 1000)}:F>\n` +
        `**🎮 Mode:** ${mode}\n` +
        `**💰 Buy-in:** ${coins >= 1000000 ? `${coins / 1000000}M` : `${coins / 1000}k`} coins\n` +
        `**📊 Points:** ${minPoints} to ${maxPoints}\n` +
        `**🎯 Format:** ${format}\n` +
        `**🎲 Nils:** ${nilAllowed ? 'Allowed' : 'Not Allowed'}\n` +
        `**👁️ Blind Nils:** ${blindNilAllowed ? 'Allowed' : 'Not Allowed'}\n\n` +
        `**Teams:** 0\n` +
        `**Need a P:** 0`
      )
      .setColor(0x0099ff)
      .setTimestamp();

    // Create registration buttons
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`register_tournament_${tournament.id}`)
          .setLabel('Register')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`cancel_registration_${tournament.id}`)
          .setLabel('Cancel Registration')
          .setStyle(ButtonStyle.Danger)
      );

    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });

    console.log(`[TOURNAMENT] Created tournament: ${name} (${tournament.id})`);

  } catch (error) {
    console.error('[TOURNAMENT] Error creating tournament:', error);
    await interaction.editReply({
      content: '❌ Error creating tournament. Please try again.'
    });
  }
}
