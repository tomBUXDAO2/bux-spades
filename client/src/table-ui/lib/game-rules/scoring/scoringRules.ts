import type { GameType } from '../../../../types/game';

/**
 * Calculates the score for a team based on their performance in the hand
 */
export function calculateGameTypeScore(
  gameType: GameType,
  bid: number,
  tricks: number,
  isNilBid: boolean = false,
  madeNil: boolean = false
): number {
  switch (gameType) {
    case 'REGULAR':
    case 'SOLO':
      if (isNilBid) {
        return madeNil ? 100 : -100;
      }
      if (tricks >= bid) {
        return (bid * 10) + (tricks - bid); // Base points + bags
      }
      return -(bid * 10); // Failed contract

    case 'WHIZ':
      if (bid === 0 && tricks === 0) {
        return 100; // Made nil
      }
      if (bid === 0 && tricks > 0) {
        return -100; // Failed nil
      }
      if (tricks === bid) {
        return bid * 20; // Double points for exact bid
      }
      return -(bid * 10); // Failed contract

    case 'MIRROR':
      if (tricks === bid) {
        return bid * 15; // 1.5x points for making exact bid
      }
      return -(bid * 10); // Failed contract

    default:
      return 0;
  }
}
