import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from 'discord.js';
import prisma from '../../lib/prisma';
import jwt from 'jsonwebtoken';
import { formatCoins } from '../utils/formatting';

// Prefer internal URL when running inside the server process
const INTERNAL_API_URL = process.env.INTERNAL_API_URL || 'http://127.0.0.1:3000';

// Store active game lines
export interface GameLine { 
  messageId: string; 
  channelId: string; 
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
  players: { userId: string; username: string; seat: number; avatar?: string }[]; 
  createdAt: number; 
  timeout?: NodeJS.Timeout 
}

export const activeGameLines = new Map<string, GameLine>();
export const channelToOpenLine = new Map<string, string>();

export async function updateGameLineEmbed(message: any, gameLine: GameLine) {
  try {
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
      .setDescription(`<@&1403953667501195284>

**${gameLineTitle}**${specialRulesText}`)
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
export async function createGameAndNotifyPlayers(message: any, gameLine: GameLine) {
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
        if (t === 'mirror' || t === 'mirror') return 'MIRROR';
        if (t === 'suicide') return 'SUICIDE';
        if (t === 'bid3' || t === 'bid 3') return 'BID 3';
        if (t === 'bidhearts' || t === 'bid hearts') return 'BID HEARTS';
        if (t === '4ornil' || t === '4 or nil') return '4 OR NIL';
        if (t === 'crazyaces' || t === 'crazy aces') return 'CRAZY ACES';
        return 'REG';
      })(),
      rated: true, // Discord games are always rated (4 human players)
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
    
    console.log('[DISCORD BOT] Making API call to create game with data:', {
      creatorId: gameData.creatorId,
      creatorName: gameData.creatorName,
      gameMode: gameData.gameMode,
      biddingOption: gameData.biddingOption,
      players: gameData.players.length
    });
    
    // Make API call to create game
    const response = await fetch(`${INTERNAL_API_URL}/api/games`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(gameData)
    });
    
    console.log('[DISCORD BOT] API response status:', response.status);
    
    if (response.ok) {
      const game = await response.json() as any;
      const gameUrl = `https://bux-spades.pro/table/${game.id}`;
      
      // Ping all players
      const playerMentions = gameLine.players.map(p => `<@${p.userId}>`).join(' ');
      
      // Build game line format: "100k Partners 100/-100 Regular nil tick bn cross"
      let gameLineFormat = `${formatCoins(gameLine.coins)} ${gameLine.gameMode.toUpperCase()} ${gameLine.maxPoints}/${gameLine.minPoints} ${gameLine.gameType.toUpperCase()}`;
      
      // Add special rules to game line format
      const specialRules = [];
      if (gameLine.screamer === 'yes') specialRules.push('SCREAMER');
      if (gameLine.assassin === 'yes') specialRules.push('ASSASSIN');
      
      // Add nil/blind nil settings only for regular games
      if (gameLine.gameType === 'regular') {
        if (gameLine.nil === 'no') specialRules.push('NO NIL');
        if (gameLine.blindNil === 'yes') specialRules.push('BLIND NIL');
      }
      
      if (specialRules.length > 0) {
        gameLineFormat += `\n**Special Rules:** ${specialRules.join(' + ')}`;
      }
      
      // Build team info
      const teamInfo = gameLine.players.map((p: any) => {
        const team = p.seat === 0 || p.seat === 2 ? '🔴 Red Team' : '🔵 Blue Team';
        return `${team}: <@${p.userId}>`;
      }).join('\n');
      
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('🎮 Table Up!')
        .setDescription(`<@&1403953667501195284>

**${gameLineFormat}**

${teamInfo}

**Please open your BUX Spades app, login with your Discord profile and you will be directed to your table...**

**GOOD LUCK! 🍀**`)
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
        .setDescription(`**${formatCoins(gameLine.coins)} ${gameLine.gameMode.toUpperCase()} ${gameLine.maxPoints}/${gameLine.minPoints} ${gameLine.gameType.toUpperCase()}**${finalSpecialRulesText}`)
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
