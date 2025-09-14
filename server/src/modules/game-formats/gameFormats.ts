import type { Game, GamePlayer, Card, Suit, Rank } from '../../types/game';

/**
 * Game format types
 */
export type GameFormat = 'REGULAR' | 'WHIZ' | 'MIRRORS' | 'GIMMICK';
export type GimmickType = 'SUICIDE' | 'BID_4_OR_NIL' | 'BID_3' | 'BID_HEARTS' | 'CRAZY_ACES';

/**
 * Game format configuration
 */
export interface GameFormatConfig {
  format: GameFormat;
  gimmickType?: GimmickType;
  allowNil: boolean;
  allowBlindNil: boolean;
  specialRules: string[];
}

/**
 * Creates game format configuration from settings
 */
export function createGameFormatConfig(settings: any): GameFormatConfig {
  const format = determineGameFormat(settings.biddingOption);
  const gimmickType = determineGimmickType(settings.biddingOption);
  
  // Handle specialRules - it can be an object or array
  let specialRules: string[] = [];
  if (settings.specialRules) {
    if (Array.isArray(settings.specialRules)) {
      specialRules = settings.specialRules;
    } else if (typeof settings.specialRules === 'object') {
      // Convert object to array of rule names
      specialRules = Object.keys(settings.specialRules).filter(key => settings.specialRules[key] === true);
    }
  }
  
  return {
    format,
    gimmickType,
    allowNil: settings.allowNil !== false,
    allowBlindNil: settings.allowBlindNil === true,
    specialRules
  };
}

/**
 * Determines game format from bidding option
 */
function determineGameFormat(biddingOption: string): GameFormat {
  switch (biddingOption) {
    case 'WHIZ':
      return 'WHIZ';
    case 'MIRRORS':
      return 'MIRRORS';
    case 'SUICIDE':
    case '4 OR NIL':
    case 'BID 3':
    case 'BID HEARTS':
    case 'CRAZY ACES':
      return 'GIMMICK';
    default:
      return 'REGULAR';
  }
}

/**
 * Determines gimmick type from bidding option
 */
function determineGimmickType(biddingOption: string): GimmickType | undefined {
  switch (biddingOption) {
    case 'SUICIDE':
      return 'SUICIDE';
    case '4 OR NIL':
      return 'BID_4_OR_NIL';
    case 'BID 3':
      return 'BID_3';
    case 'BID HEARTS':
      return 'BID_HEARTS';
    case 'CRAZY ACES':
      return 'CRAZY_ACES';
    default:
      return undefined;
  }
}

/**
 * Validates bid based on game format
 */
export function validateBid(bid: number, hand: any[], gameFormat: GameFormatConfig, playerIndex: number, game: Game): { valid: boolean; error?: string } {
  switch (gameFormat.format) {
    case 'MIRRORS':
      return validateMirrorsBid(bid, hand);
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
 * Validates mirrors bid (must bid number of spades)
 */
function validateMirrorsBid(bid: number, hand: any[]): { valid: boolean; error?: string } {
  const spadesCount = hand.filter(card => card.suit === 'SPADES').length;
  if (bid !== spadesCount) {
    return { valid: false, error: `In Mirrors, you must bid exactly ${spadesCount} (number of spades in hand)` };
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

/**
 * Gets game format description
 */
export function getGameFormatDescription(format: GameFormatConfig): string {
  switch (format.format) {
    case 'REGULAR':
      return 'Regular Spades with standard bidding';
    case 'WHIZ':
      return 'Whiz - must bid nil or number of spades';
    case 'MIRRORS':
      return 'Mirrors - must bid number of spades in hand';
    case 'GIMMICK':
      return getGimmickDescription(format.gimmickType!);
    default:
      return 'Unknown format';
  }
}

/**
 * Gets gimmick description
 */
function getGimmickDescription(gimmickType: GimmickType): string {
  switch (gimmickType) {
    case 'SUICIDE':
      return 'Suicide - one partner from each team must bid nil';
    case 'BID_4_OR_NIL':
      return '4 OR NIL - must bid either 4 or nil';
    case 'BID_3':
      return 'BID 3 - must bid exactly 3';
    case 'BID_HEARTS':
      return 'BID HEARTS - must bid number of hearts in hand';
    case 'CRAZY_ACES':
      return 'CRAZY ACES - must bid 3 for each ace';
    default:
      return 'Unknown gimmick';
  }
}

/**
 * Applies game format rules to a game
 */
export function applyGameFormatRules(game: Game, format: GameFormatConfig): void {
  // Set game rules based on format
  game.rules = {
    bidType: format.format,
    allowNil: format.allowNil,
    allowBlindNil: format.allowBlindNil,
    screamer: format.specialRules.includes('SCREAMER'),
    assassin: format.specialRules.includes('ASSASSIN')
  };
  
  // Set forced bid for gimmick games
  if (format.format === 'GIMMICK' && format.gimmickType) {
    game.forcedBid = format.gimmickType;
  }
  
  console.log('[GAME FORMAT] Applied format rules:', {
    format: format.format,
    gimmickType: format.gimmickType,
    specialRules: format.specialRules,
    rules: game.rules
  });
}
