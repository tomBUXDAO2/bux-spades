import type { Game } from '../../../../types/game';
import { clearTurnTimeout } from '../../core/timeoutManager';

/**
 * Handle consecutive timeout
 */
export async function handleConsecutiveTimeout(game: Game): Promise<void> {
  try {
    console.log(`[CONSECUTIVE TIMEOUT] Handling consecutive timeout for game ${game.id}`);
    
    // Clear the timeout
    clearTurnTimeout(game.id);
    
    // Handle the timeout logic here
    console.log(`[CONSECUTIVE TIMEOUT] Consecutive timeout handled for game ${game.id}`);
    
  } catch (error) {
    console.error('[CONSECUTIVE TIMEOUT] Error handling consecutive timeout:', error);
  }
}

/**
 * Start consecutive timeout
 */
export function startConsecutiveTimeout(game: Game): void {
  try {
    console.log(`[CONSECUTIVE TIMEOUT] Starting consecutive timeout for game ${game.id}`);
    
    // Set timeout for 60 seconds
    setTimeout(() => {
      handleConsecutiveTimeout(game);
    }, 60000);
    
  } catch (error) {
    console.error('[CONSECUTIVE TIMEOUT] Error starting consecutive timeout:', error);
  }
}
