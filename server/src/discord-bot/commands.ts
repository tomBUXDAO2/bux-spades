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
      option.setName('coins')
        .setDescription('Coins (buy-in amount)')
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
        ))
    .addStringOption(option =>
      option.setName('gamemode')
        .setDescription('Partners or Solo game')
        .setRequired(true)
        .addChoices(
          { name: 'Partners', value: 'partners' },
          { name: 'Solo', value: 'solo' }
        ))
    .addIntegerOption(option =>
      option.setName('maxpoints')
        .setDescription('Maximum points to win')
        .setRequired(true)
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
        ))
    .addIntegerOption(option =>
      option.setName('minpoints')
        .setDescription('Minimum points to lose')
        .setRequired(true)
        .addChoices(
          { name: '-100', value: -100 },
          { name: '-150', value: -150 },
          { name: '-200', value: -200 },
          { name: '-250', value: -250 }
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
    .addStringOption(option =>
      option.setName('screamer')
        .setDescription('Enable Screamer rule?')
        .setRequired(false)
        .addChoices(
          { name: 'Yes', value: 'yes' },
          { name: 'No', value: 'no' }
        ))
    .addStringOption(option =>
      option.setName('assassin')
        .setDescription('Enable Assassin rule?')
        .setRequired(false)
        .addChoices(
          { name: 'Yes', value: 'yes' },
          { name: 'No', value: 'no' }
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