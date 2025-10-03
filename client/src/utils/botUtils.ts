/**
 * Utility functions for bot-related operations
 */

/**
 * Abbreviate bot names from long unique IDs to simple "Bot 1", "Bot 2", etc.
 * @param botName - The full bot name like "Bot_bot_1_1759458496693"
 * @returns Abbreviated name like "Bot 1"
 */
export const abbreviateBotName = (botName: string): string => {
  // Convert "Bot_bot_1_1759458496693" to "Bot 1"
  const match = botName.match(/Bot_bot_(\d+)_/);
  return match ? `Bot ${match[1]}` : botName;
};

/**
 * Get display name for a player (human or bot)
 * @param username - The player's username
 * @param isBot - Whether the player is a bot
 * @returns Display name (abbreviated for bots, original for humans)
 */
export const getPlayerDisplayName = (username: string, isBot: boolean): string => {
  return isBot ? abbreviateBotName(username) : username;
};
