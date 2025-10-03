import type { GameType } from "../../types/game";

/**
 * Determines if a player can bid nil based on the game type and their hand
 */
export function canBidNil(gameType: GameType, numSpades: number): boolean {
  switch (gameType) {
    case 'REGULAR':
    case 'SOLO':
      return true; // Regular and Solo games allow nil bids
    case 'WHIZ':
      return numSpades === 0; // Only allow nil bid if no spades
    case 'MIRROR':
      return false; // Mirror games don't allow nil bids
    default:
      return false;
  }
}

/**
 * Returns the valid bid range for a player based on game type and hand
 */
export function getValidBidRange(gameType: GameType, numSpades: number): { min: number; max: number } {
  switch (gameType) {
    case 'REGULAR':
    case 'SOLO':
      return { min: 0, max: 13 }; // Full range including nil
    case 'WHIZ':
      return { min: numSpades, max: numSpades }; // Must bid number of spades
    case 'MIRROR':
      return { min: numSpades, max: numSpades }; // Must bid number of spades
    default:
      return { min: 0, max: 13 };
  }
}

/**
 * Validates if a bid is legal for the given game type and player's hand
 */
export function isValidBid(gameType: GameType, bid: number, numSpades: number): boolean {
  switch (gameType) {
    case 'REGULAR':
    case 'SOLO':
      return bid >= 0 && bid <= 13;
    case 'WHIZ':
      return bid === numSpades || (bid === 0 && numSpades === 0);
    case 'MIRROR':
      return bid === numSpades;
    default:
      return false;
  }
}
