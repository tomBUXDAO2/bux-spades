import { ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from 'discord.js';
import prisma from '../../lib/prisma';
import { activeGameLines, channelToOpenLine, GameLine } from '../game-management';
import { formatCoins } from '../utils/formatting';

export async function handleGameCommands(interaction: ChatInputCommandInteraction) {
  try {
    await interaction.deferReply();
  } catch (error) {
    console.error('Error deferring reply:', error);
    return;
  }
  
  try {
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
      .setDescription(`<@&1403953667501195284>

**${gameLineTitle}**${specialRulesText}`)
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
      mode: gameMode,
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
        const channel = await interaction.client.channels.fetch(current.channelId) as TextChannel;
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
}

export async function handleStatsCommand(interaction: ChatInputCommandInteraction) {
  try {
    await interaction.deferReply();
  } catch (error) {
    console.error("Error deferring stats reply:", error);
    return;
  }
  
  try {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    
    // Get user stats from UserStats table (same as app)
    const user = await prisma.user.findFirst({
      where: { discordId: targetUser.id }
    });
    
    if (!user) {
      await interaction.editReply(`❌ No user found for ${targetUser.username}`);
      return;
    }
    
    // Get stats from UserStats table instead of GamePlayer
    const userStats = await prisma.userStats.findUnique({
      where: { userId: user.id }
    });
    
    if (!userStats) {
      await interaction.editReply(`❌ No stats found for ${targetUser.username}`);
      return;
    }
    
    // Calculate stats from UserStats
    const totalGames = userStats.totalGamesPlayed || 0;
    const totalWins = userStats.totalGamesWon || 0;
    const totalWinPercentage = totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : "0.0";
    
    // League games are all finished games (same as app)
    const leagueGames = totalGames;
    const leagueWins = totalWins;
    const leagueWinPct = totalWinPercentage;
    
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle(`📊 Stats for ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL({ extension: "png", size: 128 }))
      .addFields(
        { name: "TOTAL GAMES:", value: "\u200b", inline: false },
        { name: "🎮 Games", value: totalGames.toString(), inline: true },
        { name: "🏆 Wins", value: totalWins.toString(), inline: true },
        { name: "📈 Win Rate", value: `${totalWinPercentage}%`, inline: true },
        { name: "\u200b", value: "\u200b", inline: false },
        { name: "LEAGUE GAMES:", value: "\u200b", inline: false },
        { name: "🎮 Games", value: leagueGames.toString(), inline: true },
        { name: "🏆 Wins", value: leagueWins.toString(), inline: true },
        { name: "📈 Win Rate", value: `${leagueWinPct}%`, inline: true },
        { name: "\u200b", value: "\u200b", inline: false },
        { name: "COINS:", value: "\u200b", inline: false },
        { name: "💰", value: user.coins.toLocaleString(), inline: true }
      )
      .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error("Error fetching stats:", error);
    await interaction.editReply("❌ Error fetching stats. Please try again.");
  }
}
export async function handleHelpCommand(interaction: ChatInputCommandInteraction) {
  try {
    await interaction.deferReply();
  } catch (error) {
    console.error('Error deferring help reply:', error);
    return;
  }
  
  try {
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
          name: '📊 Stats & Leaderboards', 
          value: '\n**/stats** - Show your game statistics\n**/stats @user** - Show another user\'s statistics\n**/leaderboard** - Top 10 by metric (Games Won, Games Played, Win %, Bags per Game, Nil Success %)\n',
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
    console.error('Error in help command:', error);
    await interaction.editReply('❌ Error displaying help. Please try again.');
  }
}

export async function handleLeaderboardCommand(interaction: ChatInputCommandInteraction) {
  try {
    await interaction.deferReply();
  } catch (error) {
    console.error('Error deferring leaderboard reply:', error);
    return;
  }
  
  try {
    const metric = interaction.options.getString('metric', true);
    
    // Get leaderboard data from database
    const leaderboard = await prisma.user.findMany({
      select: { id: true, username: true, coins: true },
      orderBy: { username: 'asc' as const },
      take: 50
    });
    
    if (leaderboard.length === 0) {
      await interaction.editReply('No players found for leaderboard.');
      return;
    }
    
    // For complex metrics, sort in application
    let sortedLeaderboard = leaderboard;
    if (metric === 'win_pct' || metric === 'nil_success_pct') {
      sortedLeaderboard = leaderboard.sort((a, b) => {
        const aValue = getPlayerValueForMetric(a, metric);
        const bValue = getPlayerValueForMetric(b, metric);
        return bValue - aValue; // Descending order
      });
    }
    
    // Take top 10
    const top10 = sortedLeaderboard.slice(0, 10);
    
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle(`🏆 ${getMetricDisplayName(metric)} Leaderboard`)
      .setDescription('Top 10 players')
      .setThumbnail('https://www.bux-spades.pro/bux-spades.png')
      .setTimestamp();
    
    top10.forEach((player, index) => {
      const value = getPlayerValueForMetric(player, metric);
      const displayValue = formatValueForMetric(value, metric);
      
      embed.addFields({
        name: `${getRankEmoji(index + 1)} ${player.username}`,
        value: displayValue,
        inline: false
      });
    });
    
    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error('Error in leaderboard command:', error);
    await interaction.editReply('❌ Error fetching leaderboard. Please try again.');
  }
}

function getOrderByForMetric(metric: string) {
  switch (metric) {
    case 'games_won':
      return { userStats: { totalGamesWon: 'desc' } } as any;
    case 'games_played':
      return { userStats: { totalGamesPlayed: 'desc' } } as any;
    case 'win_pct':
      return { userStats: { totalGamesWon: 'desc' } } as any;
    case 'bags_per_game':
      return { userStats: { bagsPerGame: 'desc' } } as any;
    case 'nil_success_pct':
      return { userStats: { nilsMade: 'desc' } } as any;
    default:
      return { userStats: { totalGamesWon: 'desc' } } as any;
  }
}

function getMetricDisplayName(metric: string): string {
  switch (metric) {
    case 'games_won': return 'Games Won';
    case 'games_played': return 'Games Played';
    case 'win_pct': return 'Win Percentage';
    case 'bags_per_game': return 'Bags per Game';
    case 'nil_success_pct': return 'Nil Success Rate';
    default: return 'Games Won';
  }
}

function getPlayerValueForMetric(player: any, metric: string): number {
  const stats = player.userStats;
  if (!stats) return 0;
  
  switch (metric) {
    case 'games_won':
      return stats.totalGamesWon;
    case 'games_played':
      return stats.totalGamesPlayed;
    case 'win_pct':
      return stats.totalGamesPlayed > 0 ? (stats.totalGamesWon / stats.totalGamesPlayed) * 100 : 0;
    case 'bags_per_game':
      return stats.bagsPerGame;
    case 'nil_success_pct':
      return stats.nilsBid > 0 ? (stats.nilsMade / stats.nilsBid) * 100 : 0;
    default:
      return stats.totalGamesWon;
  }
}

function formatValueForMetric(value: number, metric: string): string {
  switch (metric) {
    case 'win_pct':
    case 'nil_success_pct':
      return `${value.toFixed(1)}%`;
    case 'bags_per_game':
      return value.toFixed(2);
    default:
      return value.toString();
  }
}

function getRankEmoji(rank: number): string {
  switch (rank) {
    case 1: return '🥇';
    case 2: return '🥈';
    case 3: return '🥉';
    default: return `${rank}.`;
  }
}
