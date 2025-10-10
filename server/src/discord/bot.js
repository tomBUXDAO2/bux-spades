import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import { commands, handleButtonInteraction } from './commands/index.js';

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
    
    // First, get existing commands to log what's being replaced
    const existingCommands = await rest.get(
      Routes.applicationGuildCommands(clientId, guildId)
    );
    console.log(`[DISCORD BOT] Found ${existingCommands.length} existing commands:`, existingCommands.map(c => c.name));
    
    const commandData = commands.map(cmd => cmd.data.toJSON());
    console.log(`[DISCORD BOT] Registering ${commandData.length} new commands:`, commandData.map(c => c.name));
    
    // PUT will replace all existing commands with the new ones
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
client.on('ready', () => {
  console.log(`[DISCORD BOT] Logged in as ${client.user.tag}`);
  registerCommands();
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

