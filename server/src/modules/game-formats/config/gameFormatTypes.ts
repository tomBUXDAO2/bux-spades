import type { GamePlayOption } from '../../../types/game';

/**
 * Game format types
 */
export type GameFormat = 'REGULAR' | 'WHIZ' | 'MIRROR' | 'GIMMICK';
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
 * Maps GimmickType to GamePlayOption
 */
export function mapGimmickTypeToGamePlayOption(gimmickType: GimmickType): GamePlayOption {
  switch (gimmickType) {
    case 'BID_4_OR_NIL':
      return '4 OR NIL';
    case 'BID_3':
      return 'BID 3';
    case 'BID_HEARTS':
      return 'BID HEARTS';
    case 'CRAZY_ACES':
      return 'CRAZY ACES';
    case 'SUICIDE':
      return 'SUICIDE';
    default:
      return 'REGULAR';
  }
}
