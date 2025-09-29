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

// Helper functions
async function createDiscordGame(data) {
  // Implementation for creating Discord command games
  // This would create a game with all 4 players pre-assigned
  // and marked as league/rated
}

async function getUserStatsFromDB(userId, format, mode) {
  // Implementation for calculating user stats from database
  // This would use SQL aggregations instead of stored stats
}

async function getLeaderboardFromDB(format, mode, limit) {
  // Implementation for getting leaderboard from database
  // This would use SQL aggregations for real-time stats
}
