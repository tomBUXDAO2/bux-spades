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
 * Maps internal gimmick selection to client code
 */
export function mapGimmickTypeToCode(gimmickType: 'BID_4_OR_NIL' | 'BID_3' | 'BID_HEARTS' | 'CRAZY_ACES' | 'SUICIDE'): GimmickType {
  switch (gimmickType) {
    case 'BID_4_OR_NIL':
      return 'BID_4_OR_NIL';
    case 'BID_3':
      return 'BID_3';
    case 'BID_HEARTS':
      return 'BID_HEARTS';
    case 'CRAZY_ACES':
      return 'CRAZY_ACES';
    case 'SUICIDE':
      return 'SUICIDE';
    default:
      return 'BID_3'; // default unused path; shouldn't happen
  }
}
