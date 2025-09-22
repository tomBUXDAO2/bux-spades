import type { Game } from '../../../../types/game';
import { turnTimeouts } from '../../../../gamesStore';
import { TIMEOUT_CONFIG } from '../../config/timeoutConfig';
import { handleBiddingTimeout } from '../bidding/biddingTimeoutHandler';
import { handlePlayingTimeout } from '../playing/playingTimeoutHandler';
import { handleConsecutiveTimeouts } from '../consecutive/consecutiveTimeoutHandler';
import { clearTurnTimeoutOnly } from '../../core/timeoutManager';

/**
 * Handles when a player times out
 */
export function handlePlayerTimeout(game: Game, playerIndex: number, phase: 'bidding' | 'playing'): void {
  const player = game.players[playerIndex];
  if (!player) {
    console.log('[TIMEOUT] Player not found at index', playerIndex);
    return;
  }

  const timeoutKey = `${game.id}_${player.id}`;
  const timeoutData = turnTimeouts.get(timeoutKey);
  
  if (!timeoutData) {
    console.log('[TIMEOUT] No timeout data found for player', player.id);
    return;
  }

  // Increment consecutive timeouts
  const newConsecutiveTimeouts = timeoutData.consecutiveTimeouts + 1;
  
  console.log(`[TIMEOUT] Player ${player.username} timed out (${newConsecutiveTimeouts}/${TIMEOUT_CONFIG.CONSECUTIVE_TIMEOUT_LIMIT})`);
  
  // Update timeout data in place while clearing timers only
  clearTurnTimeoutOnly(game, player.id);
  turnTimeouts.set(timeoutKey, {
    ...turnTimeouts.get(timeoutKey)!,
    consecutiveTimeouts: newConsecutiveTimeouts
  });

  // Handle the timeout based on phase
  if (phase === 'bidding') {
    handleBiddingTimeout(game, playerIndex);
  } else if (phase === 'playing') {
    handlePlayingTimeout(game, playerIndex);
  }

  // Check if player should be auto-disconnected
  if (newConsecutiveTimeouts >= TIMEOUT_CONFIG.CONSECUTIVE_TIMEOUT_LIMIT) {
    handleConsecutiveTimeouts(game, playerIndex);
  }
}
