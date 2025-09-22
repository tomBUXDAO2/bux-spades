/**
 * Timeout configuration
 */
export const TIMEOUT_CONFIG = {
  BIDDING_TIMEOUT: 30000,    // 30 seconds for bidding
  PLAYING_TIMEOUT: 30000,    // 30 seconds for playing cards (changed from 45000)
  WARNING_TIMEOUT: 20000,    // 20 seconds before showing 10-second countdown overlay (NEW)
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
  warningTimer: NodeJS.Timeout | null;  // NEW: Store warning timer
  consecutiveTimeouts: number;
  startTime: number;
}
