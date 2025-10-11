import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import { commands, handleButtonInteraction } from './commands/index.js';
import { registerRoleMetadata } from './linkedRoles.js';

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error('[DISCORD BOT] Missing required environment variables: DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, or DISCORD_GUILD_ID');
  process.exit(1);
}

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Track rate limit cooldown
let rateLimitedUntil = null;

// Register slash commands with retry logic - only when needed
async function registerCommands(retries = 3) {
  // Check if we're still in rate limit cooldown
  if (rateLimitedUntil && Date.now() < rateLimitedUntil) {
    const remainingSeconds = Math.ceil((rateLimitedUntil - Date.now()) / 1000);
    console.log(`[DISCORD BOT] ⏳ Skipping command registration - rate limited for ${remainingSeconds} more seconds`);
    return;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[DISCORD BOT] Checking slash commands (attempt ${attempt}/${retries})...`);
      
      const rest = new REST({ version: '10' }).setToken(token);
      
      // First, check existing commands
      const existingCommands = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
      console.log(`[DISCORD BOT] Found ${existingCommands.length} existing commands`);
      
      const commandData = commands.map(cmd => cmd.data.toJSON());
      const commandNames = commandData.map(c => c.name);
      
      // Check if we need to register commands
      const existingNames = existingCommands.map(c => c.name);
      const needsRegistration = commandNames.length !== existingNames.length || 
                               !commandNames.every(name => existingNames.includes(name));
      
      if (!needsRegistration) {
        console.log(`[DISCORD BOT] ✅ All ${commands.length} commands already registered, skipping registration`);
        return;
      }
      
      console.log(`[DISCORD BOT] Commands need registration. Registering ${commandData.length} commands:`, commandNames);
      
      // Register commands - this will overwrite existing ones
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commandData }
      );
      
      console.log(`[DISCORD BOT] ✅ Successfully registered ${commands.length} slash commands`);
      return; // Success - exit
    } catch (error) {
      console.error(`[DISCORD BOT] Error checking/registering commands (attempt ${attempt}/${retries}):`, error.message);
      
      // If it's a rate limit error, don't retry and set cooldown
      if (error.code === 30034 || error.message?.includes('rate')) {
        // Set cooldown for 10 minutes to avoid making the problem worse
        rateLimitedUntil = Date.now() + (10 * 60 * 1000);
        console.error('[DISCORD BOT] ⏳ Rate limited - will not attempt registration for 10 minutes');
        return;
      }
      
      if (attempt < retries) {
        const delay = attempt * 2000; // Exponential backoff: 2s, 4s, 6s
        console.log(`[DISCORD BOT] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('[DISCORD BOT] Failed to register commands after all retries');
      }
    }
  }
}

// Handle interactions
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      // Handle slash commands
      const command = commands.find(cmd => cmd.data.name === interaction.commandName);
      if (command) {
        await command.execute(interaction);
      }
    } else if (interaction.isButton()) {
      // Handle button interactions
      await handleButtonInteraction(interaction);
    }
  } catch (error) {
    console.error('[DISCORD BOT] Error handling interaction:', error);
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ An error occurred while processing your request.',
        ephemeral: true
      });
    }
  }
});

// Bot ready event
client.on('ready', async () => {
  console.log(`[DISCORD BOT] Logged in as ${client.user.tag}`);
  // Command registration removed - register manually using register-discord-commands.js
  await registerRoleMetadata();
});

// Start the bot
export async function startDiscordBot() {
  try {
    await client.login(token);
    console.log('[DISCORD BOT] Bot is starting...');
  } catch (error) {
    console.error('[DISCORD BOT] Failed to start bot:', error);
  }
}

export { client };

