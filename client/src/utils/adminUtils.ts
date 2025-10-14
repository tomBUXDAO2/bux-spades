// Admin utility functions
// Checks if a user is an admin based on their Discord ID

const ADMIN_DISCORD_IDS = import.meta.env.VITE_ADMIN_DISCORD_IDS?.split(',') || [];

console.log('[ADMIN UTILS] Environment variable:', import.meta.env.VITE_ADMIN_DISCORD_IDS);
console.log('[ADMIN UTILS] Parsed admin IDs:', ADMIN_DISCORD_IDS);

/**
 * Check if a user is an admin
 * @param discordId - The user's Discord ID
 * @returns true if user is an admin
 */
export const isAdmin = (discordId: string | undefined | null): boolean => {
  console.log('[ADMIN UTILS] Checking admin status for Discord ID:', discordId);
  console.log('[ADMIN UTILS] Admin IDs list:', ADMIN_DISCORD_IDS);
  if (!discordId) return false;
  const result = ADMIN_DISCORD_IDS.includes(discordId);
  console.log('[ADMIN UTILS] Is admin?', result);
  return result;
};

/**
 * Get the list of admin Discord IDs
 * @returns Array of admin Discord IDs
 */
export const getAdminIds = (): string[] => {
  return ADMIN_DISCORD_IDS;
};

