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

// Register slash commands
async function registerCommands() {
  try {
    console.log('[DISCORD BOT] Registering slash commands...');
    
    const rest = new REST({ version: '10' }).setToken(token);
    
    // First, clear ALL existing commands (both global and guild) to avoid duplicates
    console.log('[DISCORD BOT] Clearing existing global commands...');
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: [] }
    );
    
    console.log('[DISCORD BOT] Clearing existing guild commands...');
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: [] }
    );
    
    // Wait a moment for Discord to process the deletion
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const commandData = commands.map(cmd => cmd.data.toJSON());
    console.log(`[DISCORD BOT] Registering ${commandData.length} new commands:`, commandData.map(c => c.name));
    
    // Now register the new commands (guild-specific for faster updates)
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commandData }
    );
    
    console.log(`[DISCORD BOT] ✅ Successfully registered ${commands.length} slash commands`);
  } catch (error) {
    console.error('[DISCORD BOT] Error registering commands:', error);
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
  await registerCommands();
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

