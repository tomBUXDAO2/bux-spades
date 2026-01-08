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
  // CRITICAL: Preserve currentTrick from multiple possible sources
  const currentTrickSource = state.play?.currentTrick || state.currentTrickCards || state.currentTrick || [];
  const play = state.play ? {
    ...state.play,
    currentTrick: Array.isArray(currentTrickSource) ? [...currentTrickSource.map((card: any) => ({...card}))] : []
  } : state.play;
  
  // Preserve bidding state from server
  const bidding = state.bidding ? { ...state.bidding } : state.bidding;
  
  // DEBUG: Log bidding state received from server
  console.log('[FRONTEND] DEBUG - Bidding state received:', {
    rawBidding: state.bidding,
    normalizedBidding: bidding,
    gameId: state.id,
    players: state.players?.map((p: any, i: number) => p ? ({ seat: i, bid: p.bid, seatIndex: p.seatIndex }) : null),
    bidsArray: state.bidding?.bids,
    bidsString: JSON.stringify(state.bidding?.bids)
  });
  
  // CRITICAL: Ensure currentTrickCards is properly set from multiple possible sources
  const currentTrickCards = play?.currentTrick || state.currentTrickCards || state.currentTrick || [];
  
  return { 
    ...state, 
    players: normalizedPlayers, 
    play, 
    bidding,
    hands: state.hands, // CRITICAL: Preserve hands data
    currentPlayer: state.currentPlayer, // CRITICAL: Preserve currentPlayer from server
    currentTrickCards: Array.isArray(currentTrickCards) ? currentTrickCards : [], // CRITICAL: Preserve currentTrickCards for renderTrickCards
    playerScores: state.playerScores, // CRITICAL: Preserve playerScores from server for solo games
    playerBags: state.playerBags, // CRITICAL: Preserve playerBags from server for solo games
    status: state.status, // CRITICAL: Preserve game status
    currentRound: state.currentRound, // CRITICAL: Preserve current round
    currentTrick: Array.isArray(currentTrickCards) ? currentTrickCards : [] // CRITICAL: Preserve current trick
  } as GameState;
};
