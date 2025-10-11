import { REST, Routes, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Manually define commands here to avoid importing dependencies
const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('game')
      .setDescription('Create a REGULAR league game line')
  },
  {
    data: new SlashCommandBuilder()
      .setName('whiz')
      .setDescription('Create a WHIZ league game line')
  },
  {
    data: new SlashCommandBuilder()
      .setName('mirror')
      .setDescription('Create a MIRROR league game line')
  },
  {
    data: new SlashCommandBuilder()
      .setName('gimmick')
      .setDescription('Create a GIMMICK league game line')
  },
  {
    data: new SlashCommandBuilder()
      .setName('facebookhelp')
      .setDescription('Show how to get the LEAGUE role')
  },
  {
    data: new SlashCommandBuilder()
      .setName('postfacebookhelp')
      .setDescription('Post Facebook instructions to help channel (Admin only)')
  },
  {
    data: new SlashCommandBuilder()
      .setName('userstats')
      .setDescription('Show player statistics')
  },
  {
    data: new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('Show top players')
  },
  {
    data: new SlashCommandBuilder()
      .setName('activegames')
      .setDescription('Show currently active games')
  },
  {
    data: new SlashCommandBuilder()
      .setName('pay')
      .setDescription('Admin: Pay coins to a user')
  }
];

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error('Missing required environment variables: DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, or DISCORD_GUILD_ID');
  process.exit(1);
}

async function registerCommands() {
  try {
    console.log('Registering Discord slash commands...');
    
    const rest = new REST({ version: '10' }).setToken(token);
    
    const commandData = commands.map(cmd => cmd.data.toJSON());
    console.log(`Registering ${commandData.length} commands:`, commandData.map(c => c.name));
    
    // Register guild commands
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commandData }
    );
    
    console.log(`✅ Successfully registered ${commands.length} slash commands!`);
    console.log('Commands:', commandData.map(c => `  - /${c.name}`).join('\n'));
    process.exit(0);
  } catch (error) {
    console.error('Error registering commands:', error);
    process.exit(1);
  }
}

registerCommands();

