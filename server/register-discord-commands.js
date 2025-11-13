import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { commands } from './src/discord/commands/index.js';

// Load environment variables (robust: try local, repo root fallback)
(() => {
  // First, load default .env based on current working directory
  dotenv.config();
  const hasCoreEnv = process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CLIENT_ID && process.env.DISCORD_GUILD_ID;
  if (hasCoreEnv) return;

  // Fallback 1: load from repo root (../.env relative to this file)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const rootEnvPath = path.resolve(__dirname, '..', '.env');
  dotenv.config({ path: rootEnvPath });
  if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CLIENT_ID && process.env.DISCORD_GUILD_ID) return;

  // Fallback 2: load from server/.env explicitly
  const serverEnvPath = path.resolve(__dirname, '.env');
  dotenv.config({ path: serverEnvPath });
})();

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

