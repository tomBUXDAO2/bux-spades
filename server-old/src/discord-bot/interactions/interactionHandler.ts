import { Interaction, ChatInputCommandInteraction } from 'discord.js';
import { handleAutocomplete } from './autocompleteHandler';
import { handleVerifyFacebookButton, handleGameLineButtons } from './buttonHandlers';
import { handleGameCommands, handleStatsCommand, handleHelpCommand, handleLeaderboardCommand } from './commandHandlers';
import { activeGameLines, channelToOpenLine } from '../game-management';

export async function handleInteraction(interaction: Interaction) {
  // Autocomplete for coins based on channel
  if (interaction.isAutocomplete()) {
    await handleAutocomplete(interaction);
    return;
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
      await handleVerifyFacebookButton(interaction);
      return;
    }
    
    // Handle game line buttons
    if (interaction.customId === 'join_game' || interaction.customId === 'leave_game' || interaction.customId === 'cancel_game') {
      await handleGameLineButtons(interaction);
      return;
    }
  }
  
  // Handle slash commands
  if (!interaction.isCommand()) return;
  
  if (interaction.isChatInputCommand() && ['game', 'whiz', 'mirror', 'gimmick'].includes(interaction.commandName)) {
    await handleGameCommands(interaction as ChatInputCommandInteraction);
    return;
  }
  
  // Handle stats command
  if (interaction.isChatInputCommand() && interaction.commandName === 'stats') {
    await handleStatsCommand(interaction as ChatInputCommandInteraction);
    return;
  }
  
  // Handle help command
  if (interaction.isChatInputCommand() && interaction.commandName === 'help') {
    await handleHelpCommand(interaction as ChatInputCommandInteraction);
    return;
  }
  
  // Handle leaderboard command
  if (interaction.isChatInputCommand() && interaction.commandName === 'leaderboard') {
    await handleLeaderboardCommand(interaction as ChatInputCommandInteraction);
    return;
  }
}
