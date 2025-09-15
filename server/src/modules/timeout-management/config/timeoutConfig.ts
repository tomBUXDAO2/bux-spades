/**
 * Timeout configuration
 */
export const TIMEOUT_CONFIG = {
  BIDDING_TIMEOUT: 30000,    // 30 seconds for bidding
  PLAYING_TIMEOUT: 45000,    // 45 seconds for playing cards
  CONSECUTIVE_TIMEOUT_LIMIT: 3, // Max consecutive timeouts before auto-disconnect
} as const;

/**
 * Timeout data structure
 */
export interface TimeoutData {
  gameId: string;
  playerId: string;
  playerIndex: number;
  phase: 'bidding' | 'playing';
  timer: NodeJS.Timeout | null;
  consecutiveTimeouts: number;
  startTime: number;
}
