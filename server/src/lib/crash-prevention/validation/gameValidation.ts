import type { Game } from '../../../types/game';
import { saveGameStateSafely } from '../state/stateManagement';

/**
 * Validate game state integrity
 */
export function validateGameIntegrity(game: Game): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // Check for null/undefined critical fields
  if (!game.id) issues.push('Game ID is missing');
  if (!game.status) issues.push('Game status is missing');
  if (!game.players || game.players.length !== 4) issues.push('Invalid players array');
  if (game.rated && !game.dbGameId) issues.push('Rated game missing database ID');
  
  // Check for corrupted player data
  game.players.forEach((player, index) => {
    if (player && (!player.id || !player.username)) {
      issues.push(`Player ${index} has missing ID or username`);
    }
  });
  
  // Check for invalid game state transitions
  if (game.status === 'PLAYING' && !game.currentPlayer) {
    issues.push('Game in PLAYING state but no current player');
  }
  
  if (game.status === 'BIDDING' && !game.bidding) {
    issues.push('Game in BIDDING state but no bidding data');
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

/**
 * Emergency game recovery
 */
export async function emergencyRecovery(game: Game): Promise<void> {
  console.log(`[CRASH PREVENTION] Emergency recovery for game ${game.id}`);
  
  const validation = validateGameIntegrity(game);
  if (!validation.isValid) {
    console.error(`[CRASH PREVENTION] Game ${game.id} has integrity issues:`, validation.issues);
    
    // Try to fix critical issues
    if (!game.currentPlayer && game.status === 'PLAYING') {
      const firstPlayer = game.players.find(p => p !== null);
      if (firstPlayer) {
        game.currentPlayer = firstPlayer.id;
        console.log(`[CRASH PREVENTION] Fixed missing current player for ${game.id}`);
      }
    }
    
    if (!game.bidding && game.status === 'BIDDING') {
      game.bidding = {
        bids: [null, null, null, null],
        currentPlayer: "0", currentBidderIndex: 0,
        nilBids: {}
      };
      console.log(`[CRASH PREVENTION] Fixed missing bidding data for ${game.id}`);
    }
  }
  
  // Force save the recovered state
  await saveGameStateSafely(game);
}
