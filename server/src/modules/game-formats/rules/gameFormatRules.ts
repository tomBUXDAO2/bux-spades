import type { Game } from '../../../types/game';
import { GameFormatConfig, GimmickType, mapGimmickTypeToCode } from '../config/gameFormatTypes';

/**
 * Gets game format description
 */
export function getGameFormatDescription(format: GameFormatConfig): string {
  switch (format.format) {
    case 'REGULAR':
      return 'Regular Spades with standard bidding';
    case 'WHIZ':
      return 'Whiz - must bid nil or number of spades';
    case 'MIRROR':
      return 'Mirror - must bid number of spades in hand';
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
    gameType: game.gameMode,
    minPoints: game.minPoints,
    maxPoints: game.maxPoints,
    coinAmount: game.buyIn,
    gimmickType: format.format === 'GIMMICK' && format.gimmickType ? (format.gimmickType as any) : undefined,
    bidType: format.format === 'GIMMICK' ? 'GIMMICK' : format.format,
    allowNil: format.allowNil,
    allowBlindNil: format.allowBlindNil,
    specialRules: { screamer: format.specialRules.includes('SCREAMER') || format.specialRules.includes('screamer'), assassin: format.specialRules.includes('ASSASSIN') || format.specialRules.includes('assassin') },
  };
  
  // Set forced bid for gimmick games
  game.forcedBid = format.format === 'GIMMICK' && format.gimmickType ? (format.gimmickType as any) : undefined;
  
  console.log('[GAME FORMAT] Applied format rules:', {
    format: format.format,
    gimmickType: format.gimmickType,
    specialRules: format.specialRules,
    rules: game.rules
  });
}
