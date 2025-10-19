import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

const statsCommand = {
  name: 'stats',
  description: 'Get league statistics for a user',
  options: [
    {
      type: 6, // USER type
      name: 'user',
      description: 'User to get stats for (defaults to you)',
      required: false
    }
  ]
};

async function registerStatsCommand() {
  try {
    console.log('🔄 Registering /stats command...');
    
    // Register the command
    await rest.post(Routes.applicationGuildCommands(clientId, guildId), {
      body: statsCommand
    });
    
    console.log('✅ Successfully registered /stats command');
    console.log('📋 Command details:');
    console.log(`   Name: ${statsCommand.name}`);
    console.log(`   Description: ${statsCommand.description}`);
    console.log(`   Options: ${statsCommand.options.length} option(s)`);
    
  } catch (error) {
    console.error('❌ Error registering /stats command:', error);
    
    if (error.code === 50001) {
      console.error('   Missing permissions to register commands');
    } else if (error.code === 50013) {
      console.error('   Missing access to register commands');
    } else if (error.status === 429) {
      console.error('   Rate limited - try again later');
    }
    
    process.exit(1);
  }
}

registerStatsCommand();
