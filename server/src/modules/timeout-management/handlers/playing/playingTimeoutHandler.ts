import type { Game } from '../../../../types/game';
import { io } from '../../../../index';
import { botPlayCard } from '../../../bot-play/botLogic';

/**
 * Handles playing timeout
 */
export function handlePlayingTimeout(game: Game, playerIndex: number): void {
  const player = game.players[playerIndex];
  if (!player || !game.play || !game.hands || !game.hands[playerIndex]) {
    return;
  }

  console.log(`[TIMEOUT] Handling playing timeout for ${player.username}`);
  
  const hand = game.hands[playerIndex];
  if (hand.length === 0) {
    return;
  }

  // Play the first available card (simplified logic)
  const cardToPlay = hand[0];
  hand.splice(0, 1);
  
  // Add to current trick
  game.play.currentTrick.push(cardToPlay);
  
  console.log(`[TIMEOUT] Auto-played card for ${player.username}:`, cardToPlay);
  
  // Emit timeout event
  io.to(game.id).emit('player_timeout', {
    playerId: player.id,
    playerName: player.username,
    phase: 'playing',
    action: 'auto_play_card',
    card: cardToPlay
  });
  
  // Emit card played event
  io.to(game.id).emit('card_played', {
    gameId: game.id,
    playerId: player.id,
    card: cardToPlay,
    trickNumber: game.play.trickNumber
  });
  
  // Check if trick is complete
  if (game.play.currentTrick.length === 4) {
    // Trick complete logic would go here
    console.log('[TIMEOUT] Trick complete after timeout');
  } else {
    // Move to next player
    const nextPlayerIndex = (playerIndex + 1) % 4;
    game.play.currentPlayerIndex = nextPlayerIndex;
    game.play.currentPlayer = game.players[nextPlayerIndex]?.id ?? '';
    
    io.to(game.id).emit('game_update', game);
    
    // If next player is bot, trigger their move
    if (game.players[nextPlayerIndex] && game.players[nextPlayerIndex].type === 'bot') {
      botPlayCard(game, nextPlayerIndex);
    }
  }
}
