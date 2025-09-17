import type { Card, Rank, Suit } from '../../types/game';

export interface CrazyAcesInput {
  hand: Card[];
  seatIndex: number; // 0..3
  existingBids: Array<number | null>; // length 4, null for not yet bid
}

export interface CrazyAcesResult {
  bid: number; // use 0 for NILL
  reason: string;
}

export function getCrazyAces(input: CrazyAcesInput): CrazyAcesResult {
  const { hand } = input;
  
  // Count aces in hand
  const aceCount = hand.filter(card => card.rank === 'A').length;
  
  if (aceCount === 0) {
    return { bid: 0, reason: 'Crazy Aces: no aces in hand, bid nil' };
  } else {
    const bid = aceCount * 3;
    return { bid, reason: `Crazy Aces: ${aceCount} aces in hand, bid ${bid} (${aceCount} × 3)` };
  }
}
