import type { Game } from '../../../types/game';

// Global timeout storage
const turnTimeouts = new Map<string, NodeJS.Timeout>();

/**
 * Get timeout for a game
 */
export function getTimeout(gameId: string): NodeJS.Timeout | undefined {
  return turnTimeouts.get(gameId);
}

/**
 * Set timeout for a game
 */
export function setGameTimeout(gameId: string, timeout: NodeJS.Timeout): void {
  turnTimeouts.set(gameId, timeout);
}

/**
 * Clear timeout for a game
 */
export function clearGameTimeout(gameId: string): void {
  const timeout = turnTimeouts.get(gameId);
  if (timeout) {
    clearTimeout(timeout);
    turnTimeouts.delete(gameId);
  }
}

/**
 * Clear all timeouts
 */
export function clearAllTimeouts(): void {
  for (const [gameId, timeout] of turnTimeouts) {
    clearTimeout(timeout);
  }
  turnTimeouts.clear();
}
