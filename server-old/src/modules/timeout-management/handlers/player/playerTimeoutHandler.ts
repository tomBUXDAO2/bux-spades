import type { Game } from '../../../../types/game';
import { clearTurnTimeout } from '../../core/timeoutManager';

// Global timeout storage
const turnTimeouts = new Map<string, NodeJS.Timeout>();

/**
 * Handle player timeout
 */
export async function handlePlayerTimeout(game: Game, playerIndex: number): Promise<void> {
  try {
    console.log(`[PLAYER TIMEOUT] Handling player timeout for player ${playerIndex} in game ${game.id}`);
    
    // Clear the timeout
    clearTurnTimeout(game.id);
    
    // Handle the timeout logic here
    console.log(`[PLAYER TIMEOUT] Player timeout handled for player ${playerIndex} in game ${game.id}`);
    
  } catch (error) {
    console.error('[PLAYER TIMEOUT] Error handling player timeout:', error);
  }
}

/**
 * Start player timeout
 */
export function startPlayerTimeout(game: Game, playerIndex: number): void {
  try {
    console.log(`[PLAYER TIMEOUT] Starting player timeout for player ${playerIndex} in game ${game.id}`);
    
    // Clear existing timeout
    const existingTimeout = turnTimeouts.get(game.id);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    // Set new timeout
    const timeout = setTimeout(() => {
      handlePlayerTimeout(game, playerIndex);
    }, 30000);
    
    turnTimeouts.set(game.id, timeout);
    
  } catch (error) {
    console.error('[PLAYER TIMEOUT] Error starting player timeout:', error);
  }
}
