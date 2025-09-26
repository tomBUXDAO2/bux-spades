import type { Game } from '../../../../types/game';
import { clearTurnTimeout } from '../../core/timeoutManager';
import { botMakeMove } from '../../../bot-play/botLogic';

/**
 * Handle bidding timeout
 */
export async function handleBiddingTimeout(game: Game, playerIndex: number): Promise<void> {
  try {
    console.log(`[BIDDING TIMEOUT] Handling bidding timeout for player ${playerIndex} in game ${game.id}`);
    
    // Clear the timeout
    clearTurnTimeout(game.id);
    
    // Trigger bot bid
    await botMakeMove(game, playerIndex, 'bidding');
    
  } catch (error) {
    console.error('[BIDDING TIMEOUT] Error handling bidding timeout:', error);
  }
}

/**
 * Start bidding timeout
 */
export function startBiddingTimeout(game: Game, playerIndex: number): void {
  try {
    console.log(`[BIDDING TIMEOUT] Starting bidding timeout for player ${playerIndex} in game ${game.id}`);
    
    // Set timeout for 30 seconds
    setTimeout(() => {
      handleBiddingTimeout(game, playerIndex);
    }, 30000);
    
  } catch (error) {
    console.error('[BIDDING TIMEOUT] Error starting bidding timeout:', error);
  }
}
