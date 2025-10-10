import { REST, Routes } from 'discord.js';
import { commands } from './src/discord/commands/index.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

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

