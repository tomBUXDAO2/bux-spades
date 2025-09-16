import type { Card, Suit } from '../../types/game';

export interface MirrorBidInput {
  hand: Card[];
  seatIndex: number; // 0..3
  existingBids: Array<number | null>; // length 4, null for not yet bid
}

export interface MirrorBidResult {
  bid: number; // number of spades or 0 for nil
  reason: string;
}

function countBySuit(hand: Card[]) {
  const bySuit: Record<Suit, Card[]> = { SPADES: [], HEARTS: [], DIAMONDS: [], CLUBS: [] };
  for (const c of hand) bySuit[c.suit].push(c);
  return bySuit;
}

export function getMirrorBid(input: MirrorBidInput): MirrorBidResult {
  const { hand } = input;
  const bySuit = countBySuit(hand);
  const spadesCount = bySuit.SPADES.length;

  // In MIRROR, players MUST bid the number of spades in their hand
  // If they have no spades, they must bid nil (0)
  if (spadesCount === 0) {
    return { bid: 0, reason: 'No spades - must bid nil' };
  }

  return { bid: spadesCount, reason: `Must bid ${spadesCount} (number of spades in hand)` };
}
