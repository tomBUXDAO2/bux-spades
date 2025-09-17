import type { Card, Rank, Suit } from '../../types/game';

export interface Bid3Input {
  hand: Card[];
  seatIndex: number; // 0..3
  existingBids: Array<number | null>; // length 4, null for not yet bid
}

export interface Bid3Result {
  bid: number; // use 0 for NILL
  reason: string;
}

export function getBid3(input: Bid3Input): Bid3Result {
  // Always bid 3 in bid 3 gimmick
  return { bid: 3, reason: 'Bid 3 gimmick: always bid 3' };
}
