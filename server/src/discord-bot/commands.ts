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
    .setDescription('Create a regular bidding game line')
    .addIntegerOption(option =>
      option.setName('coins')
        .setDescription('Coins (buy-in amount)')
        .setRequired(true)
        .setAutocomplete(true))
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
      option.setName('nil')
      .setDescription('Allow Nil bids?')
      .setRequired(false)
      .addChoices(
        { name: 'On', value: 'yes' },
        { name: 'Off', value: 'no' }
      ))
    .addStringOption(option =>
      option.setName('blindnil')
      .setDescription('Allow Blind Nil bids?')
      .setRequired(false)
      .addChoices(
        { name: 'On', value: 'yes' },
        { name: 'Off', value: 'no' }
      ))
    .addStringOption(option =>
      option.setName('specialrules')
      .setDescription('Special rules (none by default)')
      .setRequired(false)
      .addChoices(
        { name: 'None', value: 'none' },
        { name: 'Screamer', value: 'screamer' },
        { name: 'Assassin', value: 'assassin' },
      )),
  new SlashCommandBuilder()
    .setName('whiz')
    .setDescription('Create a Whiz game line')
    .addIntegerOption(option =>
      option.setName('coins')
        .setDescription('Coins (buy-in amount)')
        .setRequired(true)
        .setAutocomplete(true))
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
      option.setName('specialrules')
      .setDescription('Special rules (none by default)')
      .setRequired(false)
      .addChoices(
        { name: 'None', value: 'none' },
        { name: 'Screamer', value: 'screamer' },
        { name: 'Assassin', value: 'assassin' },
      )),
  new SlashCommandBuilder()
    .setName('mirror')
    .setDescription('Create a Mirror game line')
    .addIntegerOption(option =>
      option.setName('coins')
        .setDescription('Coins (buy-in amount)')
        .setRequired(true)
        .setAutocomplete(true))
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
      option.setName('specialrules')
      .setDescription('Special rules (none by default)')
      .setRequired(false)
      .addChoices(
        { name: 'None', value: 'none' },
        { name: 'Screamer', value: 'screamer' },
        { name: 'Assassin', value: 'assassin' },
      )),
  new SlashCommandBuilder()
    .setName('gimmick')
    .setDescription('Create a Gimmick game line')
    .addIntegerOption(option =>
      option.setName('coins')
        .setDescription('Coins (buy-in amount)')
        .setRequired(true)
        .setAutocomplete(true))
    .addStringOption(option =>
      option.setName('gamemode')
        .setDescription('Partners or Solo game')
        .setRequired(true)
        .addChoices(
          { name: 'Partners', value: 'partners' },
          { name: 'Solo', value: 'solo' }
        ))
    .addStringOption(option =>
      option.setName('gimmicktype')
      .setDescription('Type of gimmick game')
      .setRequired(true)
              .addChoices(
          { name: 'Suicide', value: 'SUICIDE' },
          { name: '4 or Nil', value: '4 OR NIL' },
          { name: 'Bid 3', value: 'BID 3' },
          { name: 'Bid Hearts', value: 'BID HEARTS' },
          { name: 'Crazy Aces', value: 'CRAZY ACES' }
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
      option.setName('specialrules')
      .setDescription('Special rules (none by default)')
      .setRequired(false)
      .addChoices(
        { name: 'None', value: 'none' },
        { name: 'Screamer', value: 'screamer' },
        { name: 'Assassin', value: 'assassin' },
      )),
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show user game statistics')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to check stats for (defaults to yourself)')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands and how to use them'),
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