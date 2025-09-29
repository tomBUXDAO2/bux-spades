import type { Game } from '../../../types/game';

// Global timeout storage
const turnTimeouts = new Map<string, NodeJS.Timeout>();

/**
 * Start turn timeout for a player
 */
export function startTurnTimeout(game: any, seatIndex: number, phase: 'bidding' | 'playing' | string) {
  const normalizedPhase: 'bidding' | 'playing' = (phase === 'bidding' || phase === 'playing') ? phase : 'playing';
  try {
    console.log(`[TIMEOUT MANAGER] Starting timeout for player ${seatIndex} in phase ${normalizedPhase} for game ${game.id}`);
    
    // Clear existing timeout for this game
    clearTurnTimeout(game.id);
    
    // Set new timeout
    const timeout = setTimeout(() => {
      console.log(`[TIMEOUT MANAGER] Timeout triggered for player ${seatIndex} in game ${game.id}`);
      handleTurnTimeout(game, seatIndex, normalizedPhase);
    }, 30000); // 30 second timeout
    
    turnTimeouts.set(game.id, timeout);
    
  } catch (error) {
    console.error('[TIMEOUT MANAGER] Error starting turn timeout:', error);
  }
}

/**
 * Clear turn timeout for a game
 */
export function clearTurnTimeout(gameId: string): void {
  try {
    const timeout = turnTimeouts.get(gameId);
    if (timeout) {
      clearTimeout(timeout);
      turnTimeouts.delete(gameId);
      console.log(`[TIMEOUT MANAGER] Cleared timeout for game ${gameId}`);
    }
  } catch (error) {
    console.error('[TIMEOUT MANAGER] Error clearing turn timeout:', error);
  }
}

/**
 * Handle turn timeout
 */
async function handleTurnTimeout(game: Game, playerIndex: number, phase: string): Promise<void> {
  try {
    console.log(`[TIMEOUT MANAGER] Handling timeout for player ${playerIndex} in phase ${phase}`);
    
    // Import bot logic
    const { botMakeMove } = await import('../../bot-play/botLogic');
    
    // Trigger bot move
    await botMakeMove(game, playerIndex, (phase === 'bidding' ? 'bidding' : 'playing'));
    
  } catch (error) {
    console.error('[TIMEOUT MANAGER] Error handling turn timeout:', error);
  }
}

/**
 * Clear all timeouts
 */
export function clearAllTimeouts(): void {
  try {
    for (const [gameId, timeout] of turnTimeouts) {
      clearTimeout(timeout);
      console.log(`[TIMEOUT MANAGER] Cleared timeout for game ${gameId}`);
    }
    turnTimeouts.clear();
  } catch (error) {
    console.error('[TIMEOUT MANAGER] Error clearing all timeouts:', error);
  }
}

/**
 * Get timeout for a game
 */
export function getTimeout(gameId: string): NodeJS.Timeout | undefined {
  return turnTimeouts.get(gameId);
}

/**
 * Check if game has timeout
 */
export function hasTimeout(gameId: string): boolean {
  return turnTimeouts.has(gameId);
}
