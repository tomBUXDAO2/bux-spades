import type { Game } from '../../../../types/game';
import { io } from '../../../../index';
import { TIMEOUT_CONFIG } from '../../config/timeoutConfig';
import { clearTurnTimeout } from '../../core/timeoutManager';
import { deleteUnratedGameFromDatabase } from '../../../../lib/hand-completion/game/gameCompletion';
import { enrichGameForClient } from '../../../../routes/games/shared/gameUtils';

/**
 * Handles consecutive timeouts
 */
export async function handleConsecutiveTimeouts(game: Game, playerIndex: number): Promise<void> {
  const player = game.players[playerIndex];
  if (!player) {
    return;
  }

  console.log(`[TIMEOUT] Player ${player.username} has ${TIMEOUT_CONFIG.CONSECUTIVE_TIMEOUT_LIMIT} consecutive timeouts - auto-disconnecting`);
  
  // Clear the timeout for this player
  clearTurnTimeout(game, player.id);
  
  // Emit auto-disconnect event
  io.to(game.id).emit('player_auto_disconnect', {
    playerId: player.id,
    playerName: player.username,
    reason: 'consecutive_timeouts'
  });
  
  // For unrated games, remove the player and clean up if no human players left
  if (!game.rated) {
    console.log(`[TIMEOUT] Removing player ${player.username} from unrated game`);
    
    // Remove player from game
    game.players[playerIndex] = null;

    // Notify clients of updated game state (empty seat)
    io.to(game.id).emit('game_update', enrichGameForClient(game));
    
    // Check if any human players remain
    const humanPlayersRemaining = game.players.some(p => p && p.type === 'human');
    
    if (!humanPlayersRemaining) {
      console.log(`[TIMEOUT] No human players remaining in unrated game ${game.id} - deleting game`);
      io.to(game.id).emit('game_deleted', { reason: 'no_human_players' });
      try {
        await deleteUnratedGameFromDatabase(game);
        console.log('[TIMEOUT] Successfully deleted unrated game from database via consecutive timeout cleanup');
      } catch (err) {
        console.error('[TIMEOUT] Failed to delete unrated game via consecutive timeout cleanup:', err);
      }
    }
  } else {
    // For rated games, replace with bot or mark as disconnected
    console.log(`[TIMEOUT] Would replace ${player.username} with bot or mark as disconnected in rated game`);
    // TODO: Implement bot replacement logic for rated games
  }
}
