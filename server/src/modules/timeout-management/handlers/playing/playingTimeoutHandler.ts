import type { Game } from '../../../../types/game';
import { io } from '../../../../index';
import { botPlayCard } from '../../../bot-play/botLogic';
import { handleTrickCompletion } from '../../../../lib/hand-completion/trick/trickCompletion';
import { enrichGameForClient } from '../../../../routes/games/shared/gameUtils';
import { startTurnTimeout, clearTurnTimeout } from '../../core/timeoutManager';

/**
 * Handles playing timeout
 */
export function handlePlayingTimeout(game: Game, playerIndex: number): void {
  const player = game.players[playerIndex];
  if (!player || !game.play || !game.hands || !game.hands[playerIndex]) {
    return;
  }

  console.log(`[TIMEOUT] Handling playing timeout for ${player.username}`);
  
  // Clear the timeout for this player
  clearTurnTimeout(game, player.id);
  
  const hand = game.hands[playerIndex];
  if (hand.length === 0) {
    return;
  }

  const isLeading = game.play.currentTrick.length === 0;
  let cardToPlay = hand[0];

  if (!isLeading) {
    const leadSuit = game.play.currentTrick[0].suit;
    const followSuitCards = hand.filter(c => c.suit === leadSuit);
    if (followSuitCards.length > 0) {
      // Follow suit: simple pick (lowest rank by our stored numeric value if present, else first)
      cardToPlay = followSuitCards[0];
    } else {
      // Can't follow suit: can play any; prefer non-spade if spades not broken and choice exists
      const nonSpades = hand.filter(c => c.suit !== 'SPADES');
      if (!game.play.spadesBroken && nonSpades.length > 0) {
        cardToPlay = nonSpades[0];
      } else {
        cardToPlay = hand[0];
      }
    }
  } else {
    // Leading: cannot lead spades until spades are broken unless only spades left
    if (!game.play.spadesBroken) {
      const nonSpades = hand.filter(c => c.suit !== 'SPADES');
      cardToPlay = nonSpades.length > 0 ? nonSpades[0] : hand[0];
    } else {
      cardToPlay = hand[0];
    }
  }

  // Remove from hand
  const removeIndex = hand.findIndex(c => c.suit === cardToPlay.suit && c.rank === cardToPlay.rank);
  if (removeIndex >= 0) {
    hand.splice(removeIndex, 1);
  }
  
  // Update spadesBroken when appropriate
  if (isLeading) {
    if (cardToPlay.suit === 'SPADES' && !game.play.spadesBroken) {
      game.play.spadesBroken = true;
      console.log('[RULES] Spades are now broken (auto-play lead)');
    }
  } else {
    const leadSuit = game.play.currentTrick[0].suit;
    if (!game.play.spadesBroken && cardToPlay.suit === 'SPADES' && leadSuit !== 'SPADES') {
      game.play.spadesBroken = true;
      console.log('[RULES] Spades are now broken (auto-play follow)');
    }
  }

  // Push with playerIndex for winner calc
  game.play.currentTrick.push({ ...cardToPlay, playerIndex });
  
  console.log(`[TIMEOUT] Auto-played card for ${player.username}:`, cardToPlay);
  
  io.to(game.id).emit('player_timeout', {
    playerId: player.id,
    playerName: player.username,
    phase: 'playing',
    action: 'auto_play_card',
    card: cardToPlay
  });
  
  if (game.play.currentTrick.length === 4) {
    handleTrickCompletion(game);
  } else {
    const nextPlayerIndex = (playerIndex + 1) % 4;
    game.play.currentPlayerIndex = nextPlayerIndex;
    game.play.currentPlayer = game.players[nextPlayerIndex]?.id ?? '';
    
    io.to(game.id).emit('game_update', enrichGameForClient(game));
    
    if (game.players[nextPlayerIndex] && game.players[nextPlayerIndex].type === 'bot') {
      botPlayCard(game, nextPlayerIndex);
    } else {
      startTurnTimeout(game, nextPlayerIndex, 'playing');
    }
  }
}
