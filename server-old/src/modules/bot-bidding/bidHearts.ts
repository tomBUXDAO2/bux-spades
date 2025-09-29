import type { Card, Rank, Suit } from '../../types/game';

export interface BidHeartsInput {
  hand: Card[];
  seatIndex: number; // 0..3
  existingBids: Array<number | null>; // length 4, null for not yet bid
}

export interface BidHeartsResult {
  bid: number; // use 0 for NILL
  reason: string;
}

const rankValue: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

export function getBidHearts(input: BidHeartsInput): BidHeartsResult {
  const { hand } = input;
  
  // Count hearts in hand
  const heartCount = hand.filter(card => card.suit === 'HEARTS').length;
  
  if (heartCount === 0) {
    return { bid: 0, reason: 'No hearts in hand, bid nil' };
  } else {
    return { bid: heartCount, reason: `Bid hearts: ${heartCount} hearts in hand` };
  }
}
