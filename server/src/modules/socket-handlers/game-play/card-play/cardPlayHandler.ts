import type { AuthenticatedSocket } from '../../../socket-auth';
import type { Game } from '../../../../types/game';
import { io } from '../../../../index';
import { games } from '../../../../gamesStore';
import { enrichGameForClient } from '../../../../routes/games/shared/gameUtils';
import { botPlayCard } from '../../../bot-play/botLogic';
import { handleTrickCompletion } from '../../../../lib/hand-completion/trick/trickCompletion';
import { startTurnTimeout, clearTurnTimeout } from '../../../timeout-management/core/timeoutManager';
import { getAssassinPlayableCards, getScreamerPlayableCards } from '../../../bot-play';

/**
 * Handles play_card socket event
 */
export async function handlePlayCard(socket: AuthenticatedSocket, { gameId, userId, card }: { gameId: string; userId: string; card: any }): Promise<void> {
  console.log('[PLAY CARD DEBUG] Received card play:', { gameId, userId, card, socketId: socket.id });
  
  if (!socket.isAuthenticated || !socket.userId) {
    socket.emit('error', { message: 'Not authenticated' });
    return;
  }

  try {
    const game = games.find(g => g.id === gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    if (game.status !== 'PLAYING') {
      socket.emit('error', { message: 'Game is not in playing phase' });
      return;
    }

    if (!game.play || game.play.currentPlayer !== userId) {
      socket.emit('error', { message: 'Not your turn to play' });
      return;
    }

    const playerIndex = game.players.findIndex(p => p && p.id === userId);
    if (playerIndex === -1) {
      socket.emit('error', { message: 'Player not found in game' });
      return;
    }

    // Validate card can be played
    const hand = game.hands[playerIndex];
    if (!hand || !hand.some(c => c.suit === card.suit && c.rank === card.rank)) {
      socket.emit('error', { message: 'Card not in hand' });
      return;
    }

    const isLeading = game.play.currentTrick.length === 0;

    // Compute allowed cards based on special rules (Assassin/Screamer) or standard rules
    let allowedCards = hand.slice();
    if (game.specialRules?.assassin) {
      allowedCards = getAssassinPlayableCards(game as any, hand as any, isLeading, game.play.currentTrick as any) as any;
    } else if (game.specialRules?.screamer) {
      allowedCards = getScreamerPlayableCards(game as any, hand as any, isLeading, game.play.currentTrick as any) as any;
    } else {
      // Standard rules: enforce leading spades rule below and following suit
      const leadSuitStd = game.play.currentTrick.length > 0 ? game.play.currentTrick[0].suit : null;
      if (leadSuitStd) {
        const followSuitCards = hand.filter(c => c.suit === leadSuitStd);
        if (followSuitCards.length > 0) {
          allowedCards = followSuitCards;
        }
      }
    }

    // Enforce leading spades rule for standard or screamer (assassin playable already encodes constraints)
    if (!game.specialRules?.assassin) {
      if (isLeading && card.suit === 'SPADES' && !game.play.spadesBroken) {
        const onlySpadesLeft = hand.every(c => c.suit === 'SPADES');
        if (!onlySpadesLeft) {
          socket.emit('error', { message: 'Cannot lead spades until spades are broken (unless you only have spades).' });
          return;
        }
      }
    }

    // For Assassin: if leading and spades are broken and player has any spades, they must lead spades
    if (game.specialRules?.assassin && isLeading && game.play.spadesBroken) {
      const hasSpade = hand.some(c => c.suit === 'SPADES');
      if (hasSpade && card.suit !== 'SPADES') {
        socket.emit('error', { message: 'Assassin: When leading after spades are broken, you must lead spades if you have any.' });
        return;
      }
    }

    // Check if chosen card is within allowed set
    const isAllowed = allowedCards.some(c => c.suit === card.suit && c.rank === card.rank);
    if (!isAllowed) {
      socket.emit('error', { message: 'Illegal card for current rules.' });
      return;
    }

    // Remove card from hand
    const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    hand.splice(cardIndex, 1);

    // Add to current trick
    game.play.currentTrick.push({ ...card, playerIndex });
    
    console.log('[PLAY CARD DEBUG] Card played:', { playerIndex, card, trickLength: game.play.currentTrick.length });

    // Break spades if a spade is played on a non-spade lead
    if (game.play.currentTrick.length > 0) {
      const leadSuit = game.play.currentTrick[0].suit;
      if (!game.play.spadesBroken && card.suit === 'SPADES' && leadSuit !== 'SPADES') {
        game.play.spadesBroken = true;
        console.log('[RULES] Spades are now broken');
      }
    }

    // Emit card played event
    io.to(gameId).emit('card_played', {
      gameId: gameId,
      playerId: userId,
      card: card,
      // trickNumber: game.play.trickNumber
    });

    // Clear timeout for current player since they acted
    clearTurnTimeout(game, userId);

    // Check if trick is complete
    if (game.play.currentTrick.length === 4) {
      await handleTrickCompletion(game);
    } else {
      // Move to next player
      const nextPlayerIndex = (playerIndex + 1) % 4;
      game.play.currentPlayerIndex = nextPlayerIndex;
      game.play.currentPlayer = game.players[nextPlayerIndex]?.id ?? '';
      
      io.to(gameId).emit('game_update', enrichGameForClient(game));
      
      // If next player is bot, trigger their move
      if (game.players[nextPlayerIndex] && game.players[nextPlayerIndex].type === 'bot') {
        botPlayCard(game, nextPlayerIndex);
      } else {
        // Start timeout for human player's turn
        startTurnTimeout(game, nextPlayerIndex, 'playing');
      }
    }

  } catch (error) {
    console.error('Error in play_card:', error);
    socket.emit('error', { message: 'Internal server error' });
  }
}
