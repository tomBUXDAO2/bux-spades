import type { Game } from '../../../types/game';
import { CrashPrevention } from "../../../lib/crash-prevention";

/**
 * Check if game is stuck
 */
export function isGameStuck(game: Game): boolean {
  const now = Date.now();
  const lastActionTime = game.lastActionTime || 0;
  const stuckThreshold = 5 * 60 * 1000; // 5 minutes

  // Game hasn't had action for too long
  if (now - lastActionTime > stuckThreshold) {
    return true;
  }

  // Game is in invalid state
  if (game.status === 'PLAYING' && !game.currentPlayer) {
    return true;
  }

  if (game.status === 'BIDDING' && !game.bidding) {
    return true;
  }

  return false;
}

/**
 * Recover stuck game
 */
export async function recoverStuckGame(game: Game): Promise<void> {
  console.log(`[GAME MONITOR] Attempting to recover stuck game ${game.id}`);

  try {
    // Try to fix current player
    if (game.status === 'PLAYING' && !game.currentPlayer) {
      const firstPlayer = game.players.find(p => p !== null);
      if (firstPlayer) {
        game.currentPlayer = firstPlayer.id;
        console.log(`[GAME MONITOR] Fixed missing current player for ${game.id}`);
      }
    }

    // Try to fix bidding state
    if (game.status === 'BIDDING' && !game.bidding) {
      game.bidding = {
        bids: [null, null, null, null],
        currentPlayer: "0", currentBidderIndex: 0,
        nilBids: {}
      };
      console.log(`[GAME MONITOR] Fixed missing bidding data for ${game.id}`);
    }

    // Update last action time
    game.lastActionTime = Date.now();

    // Save recovered state
    await CrashPrevention.saveGameStateSafely(game);

    console.log(`[GAME MONITOR] Successfully recovered game ${game.id}`);
  } catch (error) {
    console.error(`[GAME MONITOR] Failed to recover game ${game.id}:`, error);
  }
}
