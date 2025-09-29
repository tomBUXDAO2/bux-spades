import { ButtonInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import prisma from '../../lib/prisma';
import { activeGameLines, channelToOpenLine, updateGameLineEmbed, createGameAndNotifyPlayers, GameLine } from '../game-management';

export async function handleVerifyFacebookButton(interaction: ButtonInteraction) {
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
}

export async function handleGameLineButtons(interaction: ButtonInteraction) {
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
      await handleJoinGame(interaction, gameLine, userId, username);
    } else if (interaction.customId === 'leave_game') {
      await handleLeaveGame(interaction, gameLine, userId);
    } else if (interaction.customId === 'cancel_game') {
      await handleCancelGame(interaction, gameLine, userId, messageId);
    }
  } catch (error) {
    console.error('Error handling game button:', error);
    if (interaction.customId === 'cancel_game') {
      await interaction.followUp({ content: '❌ Error processing game action. Please try again later.', ephemeral: true });
    } else {
      await interaction.editReply('❌ Error processing game action. Please try again later.');
    }
  }
}

async function handleJoinGame(interaction: ButtonInteraction, gameLine: GameLine, userId: string, username: string) {
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
  const user = await interaction.client.users.fetch(userId);
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
  if (gameLine.players.length >= 4) {
    await createGameAndNotifyPlayers(interaction.message, gameLine);
  }
}

async function handleLeaveGame(interaction: ButtonInteraction, gameLine: GameLine, userId: string) {
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
}

async function handleCancelGame(interaction: ButtonInteraction, gameLine: GameLine, userId: string, messageId: string) {
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
