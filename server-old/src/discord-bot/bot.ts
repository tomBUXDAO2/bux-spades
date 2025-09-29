import dotenv from 'dotenv';
dotenv.config();

import { Client, GatewayIntentBits, Events } from 'discord.js';
import { registerCommands } from './commands';
import { handleInteraction } from './interactions';
import { 
  loadVerifiedUsersFromDatabase, 
  checkAndUpdateUserRole, 
  postVerificationEmbed 
} from './verification';
import { postMeetTheTeamEmbedOnce } from './embeds';
import { handleWelcomeMessage } from './events/welcomeMessage';

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

// Event: Bot is ready
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`[DISCORD BOT] Ready! Logged in as ${readyClient.user.tag}`);
  
  // Register slash commands
  await registerCommands();
  
  // Load verified users from database
  await loadVerifiedUsersFromDatabase();
  
  // Post verification embed
  await postVerificationEmbed(client);
  
  // Post team embed once
  await postMeetTheTeamEmbedOnce(client);
  
  console.log('Available guilds:');
  client.guilds.cache.forEach((guild, id) => {
    console.log(`- ${guild.name} (${id})`);
  });
  
  // Check if our target guild is accessible
  const GUILD_ID = process.env.DISCORD_GUILD_ID || '1403837418494492763';
  const targetGuild = client.guilds.cache.get(GUILD_ID);
  if (targetGuild) {
    console.log(`✅ Target guild found: ${targetGuild.name}`);
  } else {
    console.log(`❌ Target guild NOT found! Available guilds: ${Array.from(client.guilds.cache.keys()).join(', ')}`);
  }
});

// Event: New member joins
client.on(Events.GuildMemberAdd, async (member) => {
  console.log(`New member joined: ${member.user.username} (${member.id})`);
  
  // Send welcome message and give 5M coins
  await handleWelcomeMessage(member);
  
  // Check if they have Facebook connected and award role if so
  await checkAndUpdateUserRole(member.id, client);
});

// Event: Member updates (profile changes, etc.)
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  // Check if Facebook connection status changed
  await checkAndUpdateUserRole(newMember.id, client);
});

// Event: Handle interactions (commands, buttons, autocomplete)
client.on(Events.InteractionCreate, handleInteraction);

// Start the bot when this module is loaded
const token = process.env.DISCORD_BOT_TOKEN;
console.log('Discord bot startup check:');
console.log('- Token exists:', !!token);
console.log('- Token length:', token ? token.length : 0);

if (token && token.trim() !== '') {
  console.log('Attempting to start Discord bot...');
  client.login(token).then(async () => {
    console.log('Discord bot login successful!');
  }).catch((error) => {
    console.error('Failed to start Discord bot:', error);
    console.log('Discord bot will not be available');
  });
} else {
  console.log('Discord bot token not provided, bot will not start');
}

export default client;
