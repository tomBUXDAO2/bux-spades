import type { Game } from '../../../../types/game';
import { io } from '../../../../index';
import { enrichGameForClient } from '../../../../routes/games/shared/gameUtils';
import { dealNewHand } from '../../../dealing/cardDealing';

/**
 * Handles hand completion
 */
export async function handleHandComplete(game: Game): Promise<void> {
  console.log('[HAND COMPLETE] Calculating scores...');
  
  // This would integrate with the hand completion module
  // For now, just start a new hand
  dealNewHand(game);
  
  // Emit hand complete event
  io.to(game.id).emit('hand_complete', {
    gameId: game.id,
    scores: {
      team1: game.team1TotalScore || 0,
      team2: game.team2TotalScore || 0
    }
  });
  
  io.to(game.id).emit('game_update', enrichGameForClient(game));
}
