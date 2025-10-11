import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import { commands } from './src/discord/commands/index.js';

dotenv.config();

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

const commandName = process.argv[2];

if (!commandName) {
  console.error('Usage: node register-one-command.js <command-name>');
  console.log('Available commands:', commands.map(c => c.data.name).join(', '));
  process.exit(1);
}

const command = commands.find(c => c.data.name === commandName);
if (!command) {
  console.error(`Command "${commandName}" not found`);
  console.log('Available commands:', commands.map(c => c.data.name).join(', '));
  process.exit(1);
}

async function registerOneCommand() {
  try {
    const rest = new REST({ version: '10' }).setToken(token);
    
    console.log(`Registering command: ${commandName}`);
    
    const result = await rest.post(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: command.data.toJSON() }
    );
    
    console.log(`✅ Successfully registered command: ${commandName}`);
    console.log('Command ID:', result.id);
  } catch (error) {
    console.error(`❌ Failed to register command:`, error.message);
    if (error.code === 30034) {
      console.error('Rate limited. Wait before trying again.');
    }
    process.exit(1);
  }
}

registerOneCommand();

