// Bid utility functions for GameTable component
// These functions handle bidding logic

import type { GameState } from "../../types/game""";

export interface BidCallbacks {
  playBidSound: () => void;
  setCardsRevealed: (revealed: boolean) => void;
  isBlindNil: boolean;
}

/**
 * Validate bid conditions
 */
export const validateBidConditions = (
  bid: number,
  currentPlayerId: string | null,
  currentPlayer: any,
  gameState: GameState
): boolean => {
  if (!currentPlayerId || !currentPlayer) {
    console.error('Cannot bid: No current player or player ID');
    return false;
  }
  
  if (gameState.currentPlayer !== currentPlayerId) {
    console.error(`Cannot bid: Not your turn. Current player is ${gameState.currentPlayer}`);
    return false;
  }
  
  if (gameState.status !== 'BIDDING') {
    console.error(`Cannot bid: Game is not in bidding state (${gameState.status})`);
    return false;
  }
  
  return true;
};

/**
 * Emit bid event
 */
export const emitBidEvent = (
  bid: number,
  gameId: string,
  currentPlayerId: string,
  socket: any
) => {
  const payload = { gameId, userId: currentPlayerId, bid };
  socket?.emit("make_bid", payload);
};

/**
 * Handle post-bid actions
 */
export const handlePostBidActions = (
  callbacks: Pick<BidCallbacks, 'setCardsRevealed' | 'isBlindNil'>
) => {
  if (!callbacks.isBlindNil) {
    callbacks.setCardsRevealed(true);
  }
};

/**
 * Main bid handler
 */
export const handleBid = (
  bid: number,
  currentPlayerId: string | null,
  currentPlayer: any,
  gameState: GameState,
  socket: any,
  callbacks: BidCallbacks
) => {
  if (!validateBidConditions(bid, currentPlayerId, currentPlayer, gameState)) return;
  
  callbacks.playBidSound();
  emitBidEvent(bid, gameState.id, currentPlayerId!, socket);
  handlePostBidActions(callbacks);
};
