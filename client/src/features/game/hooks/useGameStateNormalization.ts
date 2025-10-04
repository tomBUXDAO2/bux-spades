import type { GameState } from "../../../types/game";

export const normalizeGameState = (state: any): GameState => {
  if (!state) return state;
  
  const players = Array.isArray(state.players) ? state.players : [];
  const normalizedPlayers = players.map((p: any, index: number) => {
    if (!p) return null;
    const position = typeof p.position === 'number' ? p.position : (typeof p.seatIndex === 'number' ? p.seatIndex : index);
    const avatarUrl = p.avatarUrl || p.avatar || (p.type === 'bot' ? '/bot-avatar.jpg' : '/default-pfp.jpg');
    const seatIndex = (typeof p.seatIndex === 'number' ? p.seatIndex : position);
    const isDealer = typeof state.dealer === 'number' ? seatIndex === state.dealer : false;
    return { ...p, position, seatIndex, avatarUrl, isDealer };
  });
  
  // Deep clone play object to ensure React detects changes
  const play = state.play ? {
    ...state.play,
    currentTrick: state.play.currentTrick ? [...state.play.currentTrick.map((card: any) => ({...card}))] : []
  } : state.play;
  
  // Preserve bidding state from server
  const bidding = state.bidding ? { ...state.bidding } : state.bidding;
  
  // DEBUG: Log bidding state received from server
  console.log('[FRONTEND] DEBUG - Bidding state received:', {
    rawBidding: state.bidding,
    normalizedBidding: bidding,
    gameId: state.id,
    players: state.players?.map((p: any, i: number) => ({ seat: i, bid: p.bid, seatIndex: p.seatIndex })),
    bidsArray: state.bidding?.bids,
    bidsString: JSON.stringify(state.bidding?.bids)
  });
  
  return { ...state, players: normalizedPlayers, play, bidding } as GameState;
};
