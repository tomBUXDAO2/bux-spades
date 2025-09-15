import type { Game } from '../../../types/game';
import { SafeOperations } from '../core/safeOperations';
import { saveGameStateSafely, restoreGameStateSafely } from '../state/stateManagement';

/**
 * Protect a rated/league game from crashes
 */
export async function protectRatedGame(game: Game, operation: () => Promise<void>): Promise<void> {
  if (!game.rated && !(game as any).league) {
    // Not a rated/league game, proceed normally
    await operation();
    return;
  }

  console.log(`[CRASH PREVENTION] Protecting rated/league game ${game.id}`);
  
  try {
    // Save game state before operation
    await saveGameStateSafely(game);
    
    // Execute the operation
    await operation();
    
    // Save game state after successful operation
    await saveGameStateSafely(game);
    
  } catch (error) {
    console.error(`[CRASH PREVENTION] Operation failed for rated game ${game.id}:`, error);
    
    // Try to restore game state
    await restoreGameStateSafely(game);
    
    // Re-throw error to be handled by caller
    throw error;
  }
}
