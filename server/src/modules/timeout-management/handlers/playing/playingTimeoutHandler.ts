import type { Game } from '../../../../types/game';
import { clearTurnTimeout } from '../../core/timeoutManager';
import { botMakeMove } from '../../../bot-play/botLogic';

/**
 * Handle playing timeout
 */
export async function handlePlayingTimeout(game: Game, playerIndex: number): Promise<void> {
  try {
    console.log(`[PLAYING TIMEOUT] Handling playing timeout for player ${playerIndex} in game ${game.id}`);
    
    // Clear the timeout
    clearTurnTimeout(game.id);
    
    // Trigger bot play
    await botMakeMove(game, playerIndex, 'playing');
    
  } catch (error) {
    console.error('[PLAYING TIMEOUT] Error handling playing timeout:', error);
  }
}

/**
 * Start playing timeout
 */
export function startPlayingTimeout(game: Game, playerIndex: number): void {
  try {
    console.log(`[PLAYING TIMEOUT] Starting playing timeout for player ${playerIndex} in game ${game.id}`);
    
    // Set timeout for 30 seconds
    setTimeout(() => {
      handlePlayingTimeout(game, playerIndex);
    }, 30000);
    
  } catch (error) {
    console.error('[PLAYING TIMEOUT] Error starting playing timeout:', error);
  }
}
