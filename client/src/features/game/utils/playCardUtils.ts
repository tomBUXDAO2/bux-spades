// Play card utility functions for GameTable component
// These functions handle card playing logic

import type { Card } from "../../../types/game";
import type { GameState } from "../../../types/game";
import { normalizeGameState } from "../hooks/useGameStateNormalization";

/**
 * When the server snapshot still includes a card we already removed optimistically
 * (race: trick_started / game_update before card_played), keep our hand row.
 */
const sumPlayerTricks = (players: GameState['players'] | undefined): number =>
  (players || []).reduce((sum, p) => sum + (p?.tricks || 0), 0);

const isSoloGameState = (state: GameState | null | undefined): boolean =>
  !!state &&
  ((state as any).gameMode === 'SOLO' || (state as any).rules?.gameType === 'SOLO');

/**
 * Solo corner scoreboard uses playerScores. Don't let a mid-hand server snapshot
 * of [0,0,0,0] wipe running totals that were already shown after the last hand.
 */
export const preserveSoloScoreboard = (
  prev: GameState | null | undefined,
  next: GameState
): GameState => {
  if (!prev || (!isSoloGameState(next) && !isSoloGameState(prev))) return next;

  const incoming = next.playerScores;
  const prevScores = prev.playerScores;
  const incomingAllZero =
    Array.isArray(incoming) &&
    incoming.length === 4 &&
    incoming.every((s) => !s);
  const prevHasScores =
    Array.isArray(prevScores) && prevScores.some((s) => (s || 0) !== 0);

  if (incomingAllZero && prevHasScores) {
    return {
      ...next,
      playerScores: prevScores,
      playerBags: Array.isArray(next.playerBags) ? next.playerBags : prev.playerBags
    };
  }
  return next;
};

/** Resolve trick-winner seat from common trick_complete payload shapes. */
export const resolveTrickWinnerSeat = (trickData: any): number | null => {
  const raw =
    trickData?.trickWinner ??
    trickData?.trick?.winnerIndex ??
    trickData?.trick?.winnerSeatIndex ??
    trickData?.trick?.winningSeatIndex ??
    trickData?.completedTrick?.winnerIndex ??
    trickData?.completedTrick?.winnerSeatIndex ??
    trickData?.completedTrick?.winningSeatIndex ??
    trickData?.winnerIndex ??
    trickData?.winnerSeatIndex ??
    null;
  if (typeof raw !== 'number' || Number.isNaN(raw) || raw < 0 || raw > 3) {
    return null;
  }
  return raw;
};

/**
 * Apply trick_complete gameState. If the server snapshot still has all made
 * counts at 0 (stale Redis race), bump the winner from previous local counts.
 */
export const applyTrickCompleteGameState = (
  prev: GameState | null | undefined,
  trickData: any
): GameState | null => {
  if (!trickData?.gameState) {
    return prev ?? null;
  }
  const next = normalizeGameState(trickData.gameState);
  if (!prev?.players) return preserveSoloScoreboard(prev, next);

  const serverTricks = sumPlayerTricks(next.players);
  const prevTricks = sumPlayerTricks(prev.players);
  // Mid-hand stale payload: server sent all zeros while we already know tricks were taken,
  // or first trick of the hand where server forgot to increment the winner.
  const winnerSeat = resolveTrickWinnerSeat(trickData);
  const looksStale =
    serverTricks === 0 &&
    (prevTricks > 0 || (typeof winnerSeat === 'number' && (prev.status === 'PLAYING' || next.status === 'PLAYING')));

  if (!looksStale || winnerSeat === null) {
    // Prefer server counts when they look real; if server is ahead, trust it.
    if (serverTricks >= prevTricks) return preserveSoloScoreboard(prev, next);
    // Server behind but not all-zero — keep higher of prev/server per seat
    return preserveSoloScoreboard(prev, {
      ...next,
      players: (next.players || []).map((p, i) => {
        if (!p) return p;
        const prevP = prev.players?.[i] || prev.players?.find((x) => x && x.seatIndex === p.seatIndex);
        const prevT = prevP?.tricks || 0;
        const nextT = p.tricks || 0;
        return nextT >= prevT ? p : { ...p, tricks: prevT };
      })
    } as GameState);
  }

  return preserveSoloScoreboard(prev, {
    ...next,
    players: (next.players || []).map((p) => {
      if (!p) return p;
      const prevP =
        prev.players?.find((x) => x && x.seatIndex === p.seatIndex) ||
        prev.players?.[p.seatIndex];
      const base = prevP?.tricks || 0;
      const tricks = p.seatIndex === winnerSeat ? base + 1 : base;
      return { ...p, tricks };
    })
  } as GameState);
};

export const mergeServerStatePreservingOptimisticHand = (
  prev: GameState,
  incoming: GameState | Record<string, unknown>,
  userId: string | undefined,
  pendingRef: { current: Card | null } | undefined
): GameState => {
  const next = normalizeGameState(incoming as GameState);
  const pending = pendingRef?.current;
  if (!pending || !userId) return preserveSoloScoreboard(prev, next);

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
    return preserveSoloScoreboard(prev, next);
  }

  const serverHas = nextHands[seat].some(
    (c: Card) => c.suit === pending.suit && c.rank === pending.rank
  );
  const alreadyRemovedInPrev = !prevHands[seat].some(
    (c: Card) => c.suit === pending.suit && c.rank === pending.rank
  );

  if (serverHas && alreadyRemovedInPrev) {
    return preserveSoloScoreboard(prev, {
      ...next,
      hands: nextHands.map((h: Card[], i: number) =>
        i === seat ? prevHands[seat] : h
      ),
    } as GameState);
  }

  return preserveSoloScoreboard(prev, next);
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
