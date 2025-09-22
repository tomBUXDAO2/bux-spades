// Import Discord bot (only if bot token is provided and valid)
export function initializeDiscordBot() {
  let discordBot: any = null;
  if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_BOT_TOKEN.trim() !== '') {
    try {
      const token = process.env.DISCORD_BOT_TOKEN.trim();
      if (token && token.length > 0) {
        discordBot = require('../../discord-bot/bot').default;
        console.log('Discord bot loaded successfully');
      } else {
        console.warn('Discord bot token is empty, skipping bot initialization');
      }
    } catch (error) {
      console.warn('Discord bot not loaded:', error);
    }
  } else {
    console.log('Discord bot token not provided, skipping bot initialization');
  }
  return discordBot;
}
