import { SlashCommandBuilder } from 'discord.js';

export const infoCommands = [
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show game statistics')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to show stats for (defaults to yourself)')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show help information'),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show leaderboard')
    .addStringOption(option =>
      option.setName('metric')
        .setDescription('Metric to sort by')
        .setRequired(true)
        .addChoices(
          { name: 'Games Won', value: 'games_won' },
          { name: 'Games Played', value: 'games_played' },
          { name: 'Win %', value: 'win_pct' },
          { name: 'Bags per Game', value: 'bags_per_game' },
          { name: 'Nil Success %', value: 'nil_success_pct' }
        )
    )
];
