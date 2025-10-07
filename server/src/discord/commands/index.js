import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { gameManager } from '../services/GameManager.js';
import { DetailedStatsService } from '../services/DetailedStatsService.js';
import { prisma } from '../config/database.js';

// Command registry
export const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('creategame')
      .setDescription('Create a new rated league game')
      .addStringOption(option =>
        option.setName('player2')
          .setDescription('Discord ID of second player')
          .setRequired(true)
      )
      .addStringOption(option =>
        option.setName('player3')
          .setDescription('Discord ID of third player')
          .setRequired(true)
      )
      .addStringOption(option =>
        option.setName('player4')
          .setDescription('Discord ID of fourth player')
          .setRequired(true)
      )
      .addIntegerOption(option =>
        option.setName('maxpoints')
          .setDescription('Maximum points to win')
          .setRequired(false)
          .setMinValue(100)
          .setMaxValue(500)
      ),
    execute: createGame
  },
  {
    data: new SlashCommandBuilder()
      .setName('userstats')
      .setDescription('Get user statistics')
      .addUserOption(option =>
        option.setName('user')
          .setDescription('User to get stats for (defaults to you)')
          .setRequired(false)
      )
      .addStringOption(option =>
        option.setName('format')
          .setDescription('Game format to filter by')
          .setRequired(false)
          .addChoices(
            { name: 'All', value: 'ALL' },
            { name: 'Regular', value: 'REGULAR' },
            { name: 'Whiz', value: 'WHIZ' },
            { name: 'Mirror', value: 'MIRROR' },
            { name: 'Gimmick', value: 'GIMMICK' }
          )
      )
      .addStringOption(option =>
        option.setName('mode')
          .setDescription('Game mode to filter by')
          .setRequired(false)
          .addChoices(
            { name: 'All', value: 'ALL' },
            { name: 'Partners', value: 'PARTNERS' },
            { name: 'Solo', value: 'SOLO' }
          )
      ),
    execute: getUserStats
  },
  {
    data: new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('Show leaderboard')
      .addStringOption(option =>
        option.setName('format')
          .setDescription('Game format to filter by')
          .setRequired(false)
          .addChoices(
            { name: 'All', value: 'ALL' },
            { name: 'Regular', value: 'REGULAR' },
            { name: 'Whiz', value: 'WHIZ' },
            { name: 'Mirror', value: 'MIRROR' },
            { name: 'Gimmick', value: 'GIMMICK' }
          )
      )
      .addStringOption(option =>
        option.setName('mode')
          .setDescription('Game mode to filter by')
          .setRequired(false)
          .addChoices(
            { name: 'All', value: 'ALL' },
            { name: 'Partners', value: 'PARTNERS' },
            { name: 'Solo', value: 'SOLO' }
          )
      )
      .addIntegerOption(option =>
        option.setName('limit')
          .setDescription('Number of players to show')
          .setRequired(false)
          .setMinValue(5)
          .setMaxValue(50)
      ),
    execute: getLeaderboard
  },
  {
    data: new SlashCommandBuilder()
      .setName('activegames')
      .setDescription('Show currently active games'),
    execute: getActiveGames
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

// Command implementations
async function createGame(interaction) {
  try {
    const player1Id = interaction.user.id;
    const player2Id = interaction.options.getString('player2');
    const player3Id = interaction.options.getString('player3');
    const player4Id = interaction.options.getString('player4');
    const maxPoints = interaction.options.getInteger('maxpoints') || 200;

    // Validate all players are different
    const players = [player1Id, player2Id, player3Id, player4Id];
    if (new Set(players).size !== 4) {
      return interaction.reply({ 
        content: '❌ All players must be different!', 
        ephemeral: true 
      });
    }

    // Create game via Discord command
    const game = await createDiscordGame({
      channelId: interaction.channel.id,
      commandMessageId: interaction.id,
      createdBy: player1Id,
      players: players,
      maxPoints,
      isLeague: true,
      isRated: true
    });

    const embed = new EmbedBuilder()
      .setTitle('🎯 League Game Created')
      .setDescription(`Game ID: \`${game.id}\``)
      .addFields(
        { name: 'Players', value: `<@${player1Id}>\n<@${player2Id}>\n<@${player3Id}>\n<@${player4Id}>`, inline: true },
        { name: 'Max Points', value: maxPoints.toString(), inline: true },
        { name: 'Status', value: 'Waiting for players to join table', inline: true }
      )
      .setColor(0x00ff00)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('[DISCORD] Error creating game:', error);
    await interaction.reply({ 
      content: '❌ Failed to create game. Please try again.', 
      ephemeral: true 
    });
  }
}

async function getUserStats(interaction) {
  try {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const format = interaction.options.getString('format') || 'ALL';
    const mode = interaction.options.getString('mode') || 'ALL';

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

    // Get detailed stats from database
    const stats = await DetailedStatsService.getUserStats(user.id, {
      mode,
      format,
      isLeague: null
    });

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${targetUser.username}'s Statistics`)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: 'Games Played', value: stats.totalGames.toString(), inline: true },
        { name: 'Games Won', value: stats.gamesWon.toString(), inline: true },
        { name: 'Win Rate', value: `${stats.winRate.toFixed(1)}%`, inline: true },
        { name: 'Total Coins', value: stats.totalCoins.toLocaleString(), inline: true },
        { name: 'Nils Bid', value: stats.nils.bid.toString(), inline: true },
        { name: 'Nils Made', value: `${stats.nils.made} (${stats.nils.rate.toFixed(1)}%)`, inline: true },
        { name: 'Blind Nils Bid', value: stats.blindNils.bid.toString(), inline: true },
        { name: 'Blind Nils Made', value: `${stats.blindNils.made} (${stats.blindNils.rate.toFixed(1)}%)`, inline: true },
        { name: 'Bags/Game', value: stats.bags.perGame.toFixed(1), inline: true }
      )
      .setColor(0x0099ff)
      .setTimestamp();

    // Add format breakdown if showing all formats
    if (format === 'ALL') {
      const formatText = Object.entries(stats.formatBreakdown)
        .map(([format, data]) => `${format}: ${data.won}/${data.played} (${data.winRate.toFixed(1)}%)`)
        .join('\n');
      
      embed.addFields({
        name: 'Format Breakdown',
        value: formatText || 'No games played',
        inline: false
      });
    }

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('[DISCORD] Error getting user stats:', error);
    await interaction.reply({ 
      content: '❌ Failed to get user stats.', 
      ephemeral: true 
    });
  }
}

async function getLeaderboard(interaction) {
  try {
    const format = interaction.options.getString('format') || 'ALL';
    const mode = interaction.options.getString('mode') || 'ALL';
    const limit = interaction.options.getInteger('limit') || 10;

    // Get leaderboard from database
    const leaderboard = await DetailedStatsService.getLeaderboard({
      mode,
      format,
      isLeague: null,
      limit,
      sortBy: 'winRate'
    });

    const embed = new EmbedBuilder()
      .setTitle('🏆 Leaderboard')
      .setDescription(`Top ${limit} players${format !== 'ALL' ? ` (${format})` : ''}${mode !== 'ALL' ? ` (${mode})` : ''}`)
      .setColor(0xffd700)
      .setTimestamp();

    let description = '';
    leaderboard.forEach((player, index) => {
      description += `**${index + 1}.** <@${player.discordId}> - ${player.winRate.toFixed(1)}% (${player.gamesWon}/${player.totalGames})\n`;
    });

    embed.setDescription(description);

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('[DISCORD] Error getting leaderboard:', error);
    await interaction.reply({ 
      content: '❌ Failed to get leaderboard.', 
      ephemeral: true 
    });
  }
}

async function getActiveGames(interaction) {
  try {
    const games = gameManager.getAllGames();

    if (games.length === 0) {
      return interaction.reply({ 
        content: '🎮 No active games currently.', 
        ephemeral: true 
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('🎮 Active Games')
      .setColor(0x00ff00)
      .setTimestamp();

    games.forEach(game => {
      const players = game.players.filter(p => p).map(p => `<@${p.id}>`).join(', ');
      embed.addFields({
        name: `Game ${game.id.slice(-8)}`,
        value: `Players: ${players}\nStatus: ${game.status}\nMode: ${game.mode}`,
        inline: true
      });
    });

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('[DISCORD] Error getting active games:', error);
    await interaction.reply({ 
      content: '❌ Failed to get active games.', 
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
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        coins: { increment: amount }
      }
    });

    const embed = new EmbedBuilder()
      .setTitle('💰 Payment Processed')
      .setDescription(`Successfully paid ${amount} coins to <@${targetUser.id}>`)
      .addFields(
        { name: 'Amount', value: `${amount} coins`, inline: true },
        { name: 'Recipient', value: `<@${targetUser.id}>`, inline: true },
        { name: 'Processed by', value: `<@${interaction.user.id}>`, inline: true }
      )
      .setColor(0x00ff00)
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

// Helper functions
async function createDiscordGame(data) {
  try {
    const gameId = `discord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create game in database
    const game = await prisma.game.create({
      data: {
        id: gameId,
        createdById: data.createdBy,
        mode: 'PARTNERS', // Discord games are always partners
        format: 'REGULAR', // Default format
        gimmickVariant: null,
        isLeague: true,
        isRated: true,
        status: 'WAITING',
        minPoints: -100,
        maxPoints: data.maxPoints || 200,
        nilAllowed: true,
        blindNilAllowed: false,
        specialRules: {},
        buyIn: 0,
        currentRound: 1,
        currentTrick: 0,
        currentPlayer: null,
        dealer: 0,
        gameState: {
          id: gameId,
          status: 'WAITING',
          mode: 'PARTNERS',
          format: 'REGULAR',
          isLeague: true,
          isRated: true,
          maxPoints: data.maxPoints || 200,
          minPoints: -100,
          players: [],
          hands: [[], [], [], []],
          currentTrickCards: [],
          play: { currentTrick: [], spadesBroken: false },
          bidding: { bids: [null, null, null, null], currentBidderIndex: 0, currentPlayer: null },
          team1TotalScore: 0,
          team2TotalScore: 0,
          team1Bags: 0,
          team2Bags: 0
        },
        createdAt: new Date()
      }
    });

    // Create game players for each Discord user
    for (let i = 0; i < data.players.length; i++) {
      const discordId = data.players[i];
      
      // Find or create user by Discord ID
      let user = await prisma.user.findUnique({
        where: { discordId }
      });
      
      if (!user) {
        // Create placeholder user for Discord ID
        user = await prisma.user.create({
          data: {
            discordId,
            username: `Discord User ${discordId.slice(-4)}`,
            avatarUrl: '/default-pfp.jpg',
            createdAt: new Date()
          }
        });
      }
      
      // Add player to game
      await prisma.gamePlayer.create({
        data: {
          gameId: game.id,
          userId: user.id,
          seatIndex: i,
          teamIndex: i % 2,
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
        channelId: data.channelId,
        commandMessageId: data.commandMessageId,
        createdBy: data.createdBy,
        status: 'WAITING',
        createdAt: new Date()
      }
    });

    return game;
  } catch (error) {
    console.error('[DISCORD] Error creating Discord game:', error);
    throw error;
  }
}

async function getUserStatsFromDB(userId, format, mode) {
  try {
    // Use the DetailedStatsService to get user stats
    const stats = await DetailedStatsService.getUserStats(userId, {
      mode,
      format,
      isLeague: null
    });
    
    return stats;
  } catch (error) {
    console.error('[DISCORD] Error getting user stats from DB:', error);
    return null;
  }
}

async function getLeaderboardFromDB(format, mode, limit) {
  try {
    // Use the DetailedStatsService to get leaderboard
    const leaderboard = await DetailedStatsService.getLeaderboard({
      mode,
      format,
      isLeague: null,
      limit,
      sortBy: 'winRate'
    });
    
    return leaderboard;
  } catch (error) {
    console.error('[DISCORD] Error getting leaderboard from DB:', error);
    return [];
  }
}
