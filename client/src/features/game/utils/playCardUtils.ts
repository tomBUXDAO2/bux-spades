// Play card utility functions for GameTable component
// These functions handle card playing logic

import type { Card } from "../../../types/game";
import type { GameState } from "../../../types/game";

export interface PlayCardCallbacks {
  setGameState: (updater: (prev: GameState) => GameState) => void;
  setPendingPlayedCard: (card: Card) => void;
  playCardSound: () => void;
  setCardBeingPlayed: (card: Card | null) => void;
  getNextPlayerId: () => string | null;
}

/**
 * Basic client-side checks only - validation happens on backend
 */
export const validatePlayCard = (
  card: Card,
  currentPlayerId: string | null,
  currentPlayer: any,
  gameState: GameState
): boolean => {
  if (!currentPlayerId || !currentPlayer) {
    console.error('Cannot play card: No current player or player ID');
    return false;
  }
  
  // Basic UI state check only - backend will validate turn
  console.log('[CLIENT] handlePlayCard called:', { 
    card, 
    gameId: gameState.id, 
    userId: currentPlayerId, 
    socketConnected: true 
  });
  console.log('[CLIENT] Current game state:', { 
    status: gameState.status, 
    currentPlayer: gameState.currentPlayer, 
    myTurn: gameState.currentPlayer === currentPlayerId 
  });
  console.log('[CLIENT] Card being played:', `${card.rank}${card.suit}`);
  
  return true;
};

/**
 * Update local hand state
 */
export const updateLocalHand = (
  card: Card,
  userId: string,
  callbacks: Pick<PlayCardCallbacks, 'setGameState'>
) => {
  callbacks.setGameState(prev => ({
    ...prev,
    hands: prev.hands?.map((hand: any, index: any) => {
      const myPlayerIndex = prev.players?.findIndex((p: any) => p && (p.id === userId || p.userId === userId));
      if (index === myPlayerIndex && Array.isArray(hand)) {
        return hand.filter(c => !(c.suit === card.suit && c.rank === card.rank));
      }
      return hand;
    })
  }));
};

/**
 * Emit play card event
 */
export const emitPlayCardEvent = (
  card: Card,
  gameId: string,
  userId: string,
  socket: any,
  callbacks: Pick<PlayCardCallbacks, 'setPendingPlayedCard'>
) => {
  callbacks.setPendingPlayedCard(card); // Optimistically show the card
  if (socket) {
    socket.emit('play_card', { gameId, userId, card });
    console.log('[CLIENT] play_card event emitted');
  }
};

/**
 * Main play card handler
 */
export const handlePlayCard = (
  card: Card,
  currentPlayerId: string | null,
  currentPlayer: any,
  gameState: GameState,
  socket: any,
  callbacks: PlayCardCallbacks
) => {
  if (!validatePlayCard(card, currentPlayerId, currentPlayer, gameState)) return;
  
  // CRITICAL: Lock hand cards immediately to prevent hover interference
  callbacks.setCardBeingPlayed(card);
  
  // OPTIMISTIC: Move to next player immediately for faster gameplay
  const nextPlayerId = callbacks.getNextPlayerId();
  if (nextPlayerId) {
    callbacks.setGameState(prev => ({
      ...prev,
      currentPlayer: nextPlayerId
    }));
    console.log('[OPTIMISTIC PLAY] Moved to next player:', nextPlayerId);
  }
  
  callbacks.playCardSound();
  updateLocalHand(card, currentPlayerId!, callbacks);
  emitPlayCardEvent(card, gameState.id, currentPlayerId!, socket, callbacks);
};
