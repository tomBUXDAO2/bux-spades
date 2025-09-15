import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import { gameCommands } from './gameCommands';
import { adminCommands } from './adminCommands';
import { infoCommands } from './infoCommands';

// Load environment variables
dotenv.config();

// Combine all commands
const commands = [
  ...gameCommands,
  ...adminCommands,
  ...infoCommands
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
