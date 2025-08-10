import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const commands = [
  new SlashCommandBuilder()
    .setName('checkfacebook')
    .setDescription('Check all members for Facebook connections and update LEAGUE roles')
    .setDefaultMemberPermissions(0x8), // Administrator permission
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