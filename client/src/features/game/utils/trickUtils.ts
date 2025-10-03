// Trick card utility functions for GameTable component
// These functions handle trick card positioning and player ordering

import type { Player, Bot } from '@/types/game';

export interface TrickCardPositions {
  [key: number]: string;
}

export interface OrderedPlayersResult {
  seatOrderedPlayers: (Player | Bot | null)[];
  mySeatIndex: number;
  referenceSeatIndex: number;
  orderedPlayers: (Player | Bot | null)[];
}

/**
 * Get table positions for trick cards
 */
export const getTrickCardPositions = (): TrickCardPositions => {
  return {
    0: 'absolute bottom-[20%] left-1/2 -translate-x-1/2',  // South
    1: 'absolute left-[20%] top-1/2 -translate-y-1/2',     // West
    2: 'absolute top-[20%] left-1/2 -translate-x-1/2',     // North
    3: 'absolute right-[20%] top-1/2 -translate-y-1/2'     // East
  };
};

/**
 * Get ordered players for trick card positioning
 */
export const getOrderedPlayersForTrick = (
  gameState: any,
  userId: string
): OrderedPlayersResult => {
  const seatOrderedPlayers = [...(gameState.players || [])].sort(
    (a, b) => (a && b ? a.position - b.position : 0)
  );
  
  const mySeatIndex = seatOrderedPlayers.findIndex(p => p && p.id === userId);
  
  // For spectators, use seat 0 as the reference point
  const referenceSeatIndex = mySeatIndex >= 0 ? mySeatIndex : 0;
  
  const orderedPlayers = [0, 1, 2, 3].map(i => 
    seatOrderedPlayers[(referenceSeatIndex + i) % 4]
  );
  
  return { 
    seatOrderedPlayers, 
    mySeatIndex, 
    referenceSeatIndex, 
    orderedPlayers 
  };
};
