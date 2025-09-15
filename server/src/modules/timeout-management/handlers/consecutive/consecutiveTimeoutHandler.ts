import type { Game } from '../../../../types/game';
import { io } from '../../../../index';
import { TIMEOUT_CONFIG } from '../../config/timeoutConfig';

/**
 * Handles consecutive timeouts
 */
export function handleConsecutiveTimeouts(game: Game, playerIndex: number): void {
  const player = game.players[playerIndex];
  if (!player) {
    return;
  }

  console.log(`[TIMEOUT] Player ${player.username} has ${TIMEOUT_CONFIG.CONSECUTIVE_TIMEOUT_LIMIT} consecutive timeouts - auto-disconnecting`);
  
  // Emit auto-disconnect event
  io.to(game.id).emit('player_auto_disconnect', {
    playerId: player.id,
    playerName: player.username,
    reason: 'consecutive_timeouts'
  });
  
  // Replace player with bot or mark as disconnected
  // This would integrate with seat replacement logic
  console.log(`[TIMEOUT] Would replace ${player.username} with bot or mark as disconnected`);
}
