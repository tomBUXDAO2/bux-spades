import type { Game, GamePlayer, Card, Suit, Rank } from '../../../types/game';
import { GameFormatConfig, GimmickType } from '../config/gameFormatTypes';

/**
 * Main bid validation function
 */
export function validateBid(bid: number, hand: any[], gameFormat: GameFormatConfig, playerIndex: number, game: Game): { valid: boolean; error?: string } {
  switch (gameFormat.format) {
    case 'MIRROR':
      return validateMirrorBid(bid, hand);
    case 'WHIZ':
      return validateWhizBid(bid, hand);
    case 'GIMMICK':
      return validateGimmickBid(bid, hand, gameFormat.gimmickType!, playerIndex, game);
    default:
      return validateRegularBid(bid);
  }
}

/**
 * Validates regular bid
 */
function validateRegularBid(bid: number): { valid: boolean; error?: string } {
  if (bid < 0 || bid > 13) {
    return { valid: false, error: 'Bid must be between 0 and 13' };
  }
  return { valid: true };
}

/**
 * Validates mirror bid (must bid number of spades)
 */
function validateMirrorBid(bid: number, hand: any[]): { valid: boolean; error?: string } {
  const spadesCount = hand.filter(card => card.suit === 'SPADES').length;
  if (bid !== spadesCount) {
    return { valid: false, error: `In Mirror, you must bid exactly ${spadesCount} (number of spades in hand)` };
  }
  return { valid: true };
}

/**
 * Validates whiz bid (must bid nil or number of spades)
 */
function validateWhizBid(bid: number, hand: any[]): { valid: boolean; error?: string } {
  const spadesCount = hand.filter(card => card.suit === 'SPADES').length;
  if (bid !== 0 && bid !== spadesCount) {
    return { valid: false, error: `In Whiz, you must bid either 0 (nil) or ${spadesCount} (number of spades)` };
  }
  return { valid: true };
}

/**
 * Validates gimmick bid
 */
function validateGimmickBid(bid: number, hand: any[], gimmickType: GimmickType, playerIndex: number, game: Game): { valid: boolean; error?: string } {
  switch (gimmickType) {
    case 'SUICIDE':
      return validateSuicideBid(bid, playerIndex, game);
    case 'BID_4_OR_NIL':
      return validateBid4OrNilBid(bid);
    case 'BID_3':
      return validateBid3Bid(bid);
    case 'BID_HEARTS':
      return validateBidHeartsBid(bid, hand);
    case 'CRAZY_ACES':
      return validateCrazyAcesBid(bid, hand);
    default:
      return { valid: true };
  }
}

/**
 * Validates suicide bid (one partner from each team must bid nil)
 */
function validateSuicideBid(bid: number, playerIndex: number, game: Game): { valid: boolean; error?: string } {
  // This is complex logic that would need to track which partners have bid nil
  // For now, just allow any bid
  return { valid: true };
}

/**
 * Validates 4 or nil bid
 */
function validateBid4OrNilBid(bid: number): { valid: boolean; error?: string } {
  if (bid !== 0 && bid !== 4) {
    return { valid: false, error: 'In 4 OR NIL, you must bid either 0 (nil) or 4' };
  }
  return { valid: true };
}

/**
 * Validates bid 3
 */
function validateBid3Bid(bid: number): { valid: boolean; error?: string } {
  if (bid !== 3) {
    return { valid: false, error: 'In BID 3, you must bid exactly 3' };
  }
  return { valid: true };
}

/**
 * Validates bid hearts
 */
function validateBidHeartsBid(bid: number, hand: any[]): { valid: boolean; error?: string } {
  const heartsCount = hand.filter(card => card.suit === 'HEARTS').length;
  if (bid !== heartsCount) {
    return { valid: false, error: `In BID HEARTS, you must bid exactly ${heartsCount} (number of hearts in hand)` };
  }
  return { valid: true };
}

/**
 * Validates crazy aces bid
 */
function validateCrazyAcesBid(bid: number, hand: any[]): { valid: boolean; error?: string } {
  const acesCount = hand.filter(card => card.rank === 'A').length;
  const expectedBid = acesCount * 3;
  if (bid !== expectedBid) {
    return { valid: false, error: `In CRAZY ACES, you must bid ${expectedBid} (3 for each ace)` };
  }
  return { valid: true };
}
