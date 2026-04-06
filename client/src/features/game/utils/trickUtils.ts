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
 * Get table positions for trick cards.
 * One slot per display seat — card sits near that seat (south/west/north/east).
 *
 * On mobile, left/right use a larger inset (26%) so wide trick cards clear side avatars.
 * Top/bottom use a *smaller* inset than sides: if north/south use the same large % as east/west,
 * both vertical cards sit too close to the middle and overlap once trick cards are scaled up.
 */
export const getTrickCardPositions = (mobile?: boolean, viewportHeight?: number): TrickCardPositions => {
  if (mobile) {
    const h = viewportHeight ?? 800;
    if (h < 440) {
      return {
        0: 'absolute bottom-[6%] left-1/2 -translate-x-1/2',
        1: 'absolute left-[26%] top-1/2 -translate-y-1/2',
        2: 'absolute left-1/2 top-[6%] -translate-x-1/2',
        3: 'absolute right-[26%] top-1/2 -translate-y-1/2',
      };
    }
    if (h < 520) {
      return {
        0: 'absolute bottom-[9%] left-1/2 -translate-x-1/2',
        1: 'absolute left-[26%] top-1/2 -translate-y-1/2',
        2: 'absolute left-1/2 top-[9%] -translate-x-1/2',
        3: 'absolute right-[26%] top-1/2 -translate-y-1/2',
      };
    }
    return {
      0: 'absolute bottom-[12%] left-1/2 -translate-x-1/2',
      1: 'absolute left-[26%] top-1/2 -translate-y-1/2',
      2: 'absolute left-1/2 top-[12%] -translate-x-1/2',
      3: 'absolute right-[26%] top-1/2 -translate-y-1/2',
    };
  }
  return {
    0: 'absolute bottom-[20%] left-1/2 -translate-x-1/2',
    1: 'absolute left-[20%] top-1/2 -translate-y-1/2',
    2: 'absolute left-1/2 top-[20%] -translate-x-1/2',
    3: 'absolute right-[20%] top-1/2 -translate-y-1/2',
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
  
  const mySeatIndex = seatOrderedPlayers.findIndex(p => p && (p.id === userId || p.userId === userId));
  
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
