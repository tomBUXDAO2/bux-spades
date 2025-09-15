import type { Game } from '../../../types/game';
import { turnTimeouts } from '../../../gamesStore';
import { TIMEOUT_CONFIG, TimeoutData } from '../config/timeoutConfig';
import { handlePlayerTimeout } from '../handlers/timeoutHandlers';

/**
 * Starts a timeout for a player's turn
 */
export function startTurnTimeout(game: Game, playerIndex: number, phase: 'bidding' | 'playing'): void {
  const player = game.players[playerIndex];
  if (!player) {
    console.log('[TIMEOUT] No player at index', playerIndex);
    return;
  }

  const playerId = player.id;
  const timeoutKey = `${game.id}_${playerId}`;
  
  // Clear existing timeout if any
  clearTurnTimeout(game, playerId);
  
  const timeoutDuration = phase === 'bidding' ? TIMEOUT_CONFIG.BIDDING_TIMEOUT : TIMEOUT_CONFIG.PLAYING_TIMEOUT;
  
  console.log(`[TIMEOUT] Starting ${phase} timeout for player ${player.username} (${timeoutDuration}ms)`);
  
  const timer = setTimeout(() => {
    handlePlayerTimeout(game, playerIndex, phase);
  }, timeoutDuration);
  
  // Store timeout data
  turnTimeouts.set(timeoutKey, {
    gameId: game.id,
    playerId,
    playerIndex,
    phase,
    timer,
    consecutiveTimeouts: 0,
    startTime: Date.now()
  });
}

/**
 * Clears a timeout for a specific player
 */
export function clearTurnTimeout(game: Game, playerId: string): void {
  const timeoutKey = `${game.id}_${playerId}`;
  const existingTimeout = turnTimeouts.get(timeoutKey);
  
  if (existingTimeout && existingTimeout.timer) {
    console.log(`[TIMEOUT] Clearing timeout for player ${playerId}`);
    clearTimeout(existingTimeout.timer);
    turnTimeouts.delete(timeoutKey);
  }
}

/**
 * Clears timeout but keeps consecutive timeout count
 */
export function clearTurnTimeoutOnly(game: Game, playerId: string): void {
  const timeoutKey = `${game.id}_${playerId}`;
  const existingTimeout = turnTimeouts.get(timeoutKey);
  
  if (existingTimeout && existingTimeout.timer) {
    clearTimeout(existingTimeout.timer);
    turnTimeouts.set(timeoutKey, {
      ...existingTimeout,
      timer: null,
      consecutiveTimeouts: existingTimeout.consecutiveTimeouts
    });
  }
}
