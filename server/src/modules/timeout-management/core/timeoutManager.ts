import type { Game } from '../../../types/game';
import { turnTimeouts } from '../../../gamesStore';
import { TIMEOUT_CONFIG, TimeoutData } from '../config/timeoutConfig';
import { handlePlayerTimeout } from '../handlers/timeoutHandlers';
import { io } from '../../../index';

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
  
  // Start warning timer (20 seconds) to show countdown overlay
  const warningTimer = setTimeout(() => {
    console.log(`[TIMEOUT] Warning: Player ${player.username} has 10 seconds left`);
    io.to(game.id).emit('countdown_start', {
      playerId: player.id,
      playerIndex: playerIndex,
      timeLeft: 10
    });
  }, TIMEOUT_CONFIG.WARNING_TIMEOUT);
  
  // Store timeout data (including warning timer)
  turnTimeouts.set(timeoutKey, {
    gameId: game.id,
    playerId,
    playerIndex,
    phase,
    timer,
    warningTimer,  // NEW: Store warning timer
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
  
  if (existingTimeout) {
    console.log(`[TIMEOUT] Clearing timeout for player ${playerId}`);
    
    // Clear main timer
    if (existingTimeout.timer) {
      clearTimeout(existingTimeout.timer);
    }
    
    // Clear warning timer
    if (existingTimeout.warningTimer) {
      clearTimeout(existingTimeout.warningTimer);
    }
    
    turnTimeouts.delete(timeoutKey);
  }
}

/**
 * Clears timeout but keeps consecutive timeout count
 */
export function clearTurnTimeoutOnly(game: Game, playerId: string): void {
  const timeoutKey = `${game.id}_${playerId}`;
  const existingTimeout = turnTimeouts.get(timeoutKey);
  
  if (existingTimeout) {
    // Clear main timer
    if (existingTimeout.timer) {
      clearTimeout(existingTimeout.timer);
    }
    
    // Clear warning timer
    if (existingTimeout.warningTimer) {
      clearTimeout(existingTimeout.warningTimer);
    }
    
    turnTimeouts.set(timeoutKey, {
      ...existingTimeout,
      timer: null,
      warningTimer: null,  // NEW: Clear warning timer
      consecutiveTimeouts: existingTimeout.consecutiveTimeouts
    });
  }
}
