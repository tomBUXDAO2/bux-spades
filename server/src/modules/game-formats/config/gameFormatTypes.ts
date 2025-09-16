import type { GamePlayOption } from '../../../types/game';

/**
 * Game format types
 */
export type GameFormat = 'REGULAR' | 'WHIZ' | 'MIRROR' | 'GIMMICK';
export type GimmickType = 'SUICIDE' | 'BID4NIL' | 'BID3' | 'BIDHEARTS' | 'CRAZY ACES';

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
      return 'BID4NIL';
    case 'BID_3':
      return 'BID3';
    case 'BID_HEARTS':
      return 'BIDHEARTS';
    case 'CRAZY_ACES':
      return 'CRAZY ACES';
    case 'SUICIDE':
      return 'SUICIDE';
    default:
      return 'BID3'; // default unused path; shouldn't happen
  }
}
