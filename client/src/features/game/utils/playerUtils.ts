// Player utility functions for GameTable component
// These functions handle player positioning and rotation

import type { Player, Bot } from '@/types/game';

export interface PlayerWithDisplayPosition extends Player {
  displayPosition: number;
}

export interface BotWithDisplayPosition extends Bot {
  displayPosition: number;
}

export type PlayerWithPosition = PlayerWithDisplayPosition | BotWithDisplayPosition;

/**
 * Get current player position
 */
export const getCurrentPlayerPosition = (currentPlayer: any): number => {
  return currentPlayer?.seatIndex ?? 0;
};

/**
 * Calculate display position for a player
 */
export const calculateDisplayPosition = (
  player: Player | Bot, 
  currentPlayerPosition: number
): number => {
  return (4 + (player.seatIndex ?? 0) - currentPlayerPosition) % 4;
};

/**
 * Create rotated players array
 */
export const createRotatedPlayers = (
  sanitizedPlayers: (Player | Bot | null)[],
  currentPlayerPosition: number
): (PlayerWithPosition | null)[] => {
  return sanitizedPlayers.map((player) => {
    if (!player) return null;
    const newPosition = calculateDisplayPosition(player, currentPlayerPosition);
    return { ...player, displayPosition: newPosition } as PlayerWithPosition;
  });
};

/**
 * Create final positions array
 */
export const createFinalPositions = (
  rotatedPlayers: (PlayerWithPosition | null)[]
): (Player | Bot | null)[] => {
  const positions = Array(4).fill(null);
  
  rotatedPlayers
    .filter((player): player is PlayerWithPosition => 
      player !== null && player.displayPosition !== undefined
    )
    .forEach((player) => {
      positions[player.displayPosition] = player;
    });
  
  return positions;
};

/**
 * Rotate players for current view (main function)
 */
export const rotatePlayersForCurrentView = (
  sanitizedPlayers: (Player | Bot | null)[],
  currentPlayer: any
): (Player | Bot | null)[] => {
  const currentPlayerPosition = getCurrentPlayerPosition(currentPlayer);
  const rotatedPlayers = createRotatedPlayers(sanitizedPlayers, currentPlayerPosition);
  return createFinalPositions(rotatedPlayers);
};
