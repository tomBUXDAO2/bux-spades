import type { Game } from '../../../types/game';
import { turnTimeouts } from '../../../gamesStore';
import { TimeoutData } from '../config/timeoutConfig';

/**
 * Gets timeout status for a player
 */
export function getTimeoutStatus(game: Game, playerId: string): TimeoutData | null {
  const timeoutKey = `${game.id}_${playerId}`;
  return turnTimeouts.get(timeoutKey) || null;
}

/**
 * Clears all timeouts for a game
 */
export function clearAllTimeoutsForGame(gameId: string): void {
  for (const [key, timeoutData] of turnTimeouts.entries()) {
    if (timeoutData.gameId === gameId) {
      // Clear main timer
      if (timeoutData.timer) {
        clearTimeout(timeoutData.timer);
      }
      // Clear warning timer
      if (timeoutData.warningTimer) {
        clearTimeout(timeoutData.warningTimer);
      }
      turnTimeouts.delete(key);
    }
  }
}

/**
 * Gets all active timeouts
 */
export function getAllActiveTimeouts(): Map<string, TimeoutData> {
  return new Map(turnTimeouts);
}
