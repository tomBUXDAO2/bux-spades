/**
 * Utility functions for handling bot names
 */

/**
 * Abbreviate a bot name to a short format like "Bot 1"
 * @param rawName - The raw bot name (e.g., "Bot_bot_1_1759621691491")
 * @param seatIndex - Optional seat index to use instead of parsing from name
 * @returns Abbreviated name like "Bot 1"
 */
export function abbreviateBotName(rawName: string, seatIndex?: number): string {
  if (typeof seatIndex === 'number') {
    return `Bot ${seatIndex}`;
  }
  
  if (typeof rawName === 'string') {
    // Match formats like "Bot_bot_1_1759..." or "Bot-1" or "Bot 1"
    const match = rawName.match(/Bot[_-]?bot[_-]?(\d+)/i) || rawName.match(/Bot\s*(\d+)/i);
    if (match && match[1]) {
      return `Bot ${match[1]}`;
    }
  }
  
  return 'Bot';
}

/**
 * Check if a username belongs to a bot
 * @param username - The username to check
 * @returns True if the username is a bot name
 */
export function isBotName(username: string): boolean {
  return Boolean(username && username.toLowerCase().startsWith('bot'));
}

/**
 * Get display name for a player (abbreviates bot names)
 * @param username - The raw username
 * @param seatIndex - Optional seat index for bots
 * @returns Display name (abbreviated for bots)
 */
export function getDisplayName(username: string, seatIndex?: number): string {
  if (isBotName(username)) {
    return abbreviateBotName(username, seatIndex);
  }
  return username;
}
