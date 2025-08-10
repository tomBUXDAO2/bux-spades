import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const commands = [
  new SlashCommandBuilder()
    .setName('checkfacebook')
    .setDescription('Check all members for Facebook connections and update LEAGUE roles')
    .setDefaultMemberPermissions(0x8), // Administrator permission
  new SlashCommandBuilder()
    .setName('game')
    .setDescription('Create a game line for league members to join')
    .addIntegerOption(option =>
      option.setName('maxpoints')
        .setDescription('Maximum points to win')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1000))
    .addIntegerOption(option =>
      option.setName('minpoints')
        .setDescription('Minimum points to lose')
        .setRequired(true)
        .setMinValue(-1000)
        .setMaxValue(0))
    .addStringOption(option =>
      option.setName('gamemode')
        .setDescription('Partners or Solo game')
        .setRequired(true)
        .addChoices(
          { name: 'Partners', value: 'partners' },
          { name: 'Solo', value: 'solo' }
        ))
    .addStringOption(option =>
      option.setName('gametype')
        .setDescription('Type of game')
        .setRequired(true)
        .addChoices(
          { name: 'Regular', value: 'regular' },
          { name: 'Whiz', value: 'whiz' },
          { name: 'Mirror', value: 'mirror' },
          { name: 'Suicide', value: 'suicide' },
          { name: 'Bid 3/4', value: 'bid34' },
          { name: 'Nil/Bid Hearts', value: 'nilhearts' },
          { name: 'Crazy Aces', value: 'crazyaces' }
        ))
    .addBooleanOption(option =>
      option.setName('specialrules')
        .setDescription('Include special rules?')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('specialrule1')
        .setDescription('First special rule (if enabled)')
        .setRequired(false)
        .addChoices(
          { name: 'Screamer', value: 'screamer' },
          { name: 'Assassin', value: 'assassin' }
        ))
    .addStringOption(option =>
      option.setName('specialrule2')
        .setDescription('Second special rule (if enabled)')
        .setRequired(false)
        .addChoices(
          { name: 'Screamer', value: 'screamer' },
          { name: 'Assassin', value: 'assassin' }
        )),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN!);

export async function registerCommands() {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  registerCommands();
} 