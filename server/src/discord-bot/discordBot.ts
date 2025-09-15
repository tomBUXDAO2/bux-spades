import dotenv from 'dotenv';
dotenv.config();

import { Client, GatewayIntentBits } from 'discord.js';
import prisma from '../lib/prisma';
import { registerCommands } from './commands';

// Import our modular components
import { 
  handleClientReady, 
  handleGuildMemberAdd, 
  handleGuildMemberUpdate 
} from './events';
import { loadVerifiedUsersFromDatabase } from './verification';
import { postMeetTheTeamEmbedOnce } from './embeds';

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

// Register event handlers
handleClientReady(client);
handleGuildMemberAdd(client);
handleGuildMemberUpdate(client);

// Start the bot when this module is loaded
const token = process.env.DISCORD_BOT_TOKEN;
console.log('Discord bot startup check:');
console.log('- Token exists:', !!token);
console.log('- Token length:', token ? token.length : 0);

if (token && token.trim() !== '') {
  console.log('Attempting to start Discord bot...');
  client.login(token).then(async () => {
    console.log('Discord bot login successful!');
    
    // Register slash commands
    await registerCommands();
    
    // Load verified users from database after successful login
    try {
      // Test database connection first
      console.log('[DISCORD BOT] Testing database connection...');
      await prisma.$queryRaw`SELECT 1`;
      console.log('[DISCORD BOT] Database connection successful');
      
      await loadVerifiedUsersFromDatabase();
      
      // Post the team embed once in the configured channel
      await postMeetTheTeamEmbedOnce(client);
    } catch (dbError) {
      console.warn('Database error during startup - Discord bot will continue without verified users:', dbError);
      console.warn('The bot will still function, but verified users will need to be loaded manually');
    }
  }).catch((error) => {
    console.error('Failed to start Discord bot:', error);
    console.log('Discord bot will not be available');
  });
} else {
  console.log('Discord bot token not provided, bot will not start');
}

export default client;
