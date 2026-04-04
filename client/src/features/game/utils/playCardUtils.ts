// Play card utility functions for GameTable component
// These functions handle card playing logic

import type { Card } from "../../../types/game";
import type { GameState } from "../../../types/game";
import { normalizeGameState } from "../hooks/useGameStateNormalization";

/**
 * When the server snapshot still includes a card we already removed optimistically
 * (race: trick_started / game_update before card_played), keep our hand row.
 */
export const mergeServerStatePreservingOptimisticHand = (
  prev: GameState,
  incoming: GameState | Record<string, unknown>,
  userId: string | undefined,
  pendingRef: { current: Card | null } | undefined
): GameState => {
  const next = normalizeGameState(incoming as GameState);
  const pending = pendingRef?.current;
  if (!pending || !userId) return next;

  const me = next.players?.find(
    (p: any) => p && (p.id === userId || p.userId === userId)
  );
  const seat = me?.seatIndex ?? -1;
  const nextHands = (next as any).hands as Card[][] | undefined;
  const prevHands = (prev as any).hands as Card[][] | undefined;
  if (
    seat < 0 ||
    !Array.isArray(nextHands?.[seat]) ||
    !Array.isArray(prevHands?.[seat])
  ) {
    return next;
  }

  const serverHas = nextHands[seat].some(
    (c: Card) => c.suit === pending.suit && c.rank === pending.rank
  );
  const alreadyRemovedInPrev = !prevHands[seat].some(
    (c: Card) => c.suit === pending.suit && c.rank === pending.rank
  );

  if (serverHas && alreadyRemovedInPrev) {
    return {
      ...next,
      hands: nextHands.map((h: Card[], i: number) =>
        i === seat ? prevHands[seat] : h
      ),
    } as GameState;
  }

  return next;
};

// Light debounce to prevent double-submits; reset when a new trick starts (see resetCardPlayDebounce)
let lastCardPlayTime = 0;
const CARD_PLAY_DEBOUNCE_MS = 200;

export const resetCardPlayDebounce = () => {
  lastCardPlayTime = 0;
};

/** Synced from GameTable whenever `pendingPlayedCard` changes — used by useSocketEventHandlers merge. */
export const optimisticSocketMergeRef: { current: Card | null } = { current: null };

export interface PlayCardCallbacks {
  setGameState: (updater: (prev: GameState) => GameState) => void;
  setPendingPlayedCard: (card: Card) => void;
  playCardSound: () => void;
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
  
  // Debounce check - prevent rapid card plays
  const now = Date.now();
  if (now - lastCardPlayTime < CARD_PLAY_DEBOUNCE_MS) {
    console.log('[CLIENT] Card play debounced - too soon after last play');
    return false;
  }
  lastCardPlayTime = now;
  
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
  
  callbacks.playCardSound();
  updateLocalHand(card, currentPlayerId!, callbacks);
  emitPlayCardEvent(card, gameState.id, currentPlayerId!, socket, callbacks);
};
