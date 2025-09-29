import type { Card, Rank, Suit } from '../../types/game';
import { getRegularBid } from './regular';

export interface Bid4OrNilInput {
  hand: Card[];
  seatIndex: number; // 0..3
  existingBids: Array<number | null>; // length 4, null for not yet bid
}

export interface Bid4OrNilResult {
  bid: number; // use 0 for NILL
  reason: string;
}

const rankValue: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

function hasRank(hand: Card[], rank: Rank): boolean {
  return hand.some(c => c.rank === rank);
}

function countBySuit(hand: Card[]) {
  const bySuit: Record<Suit, Card[]> = { SPADES: [], HEARTS: [], DIAMONDS: [], CLUBS: [] };
  for (const c of hand) bySuit[c.suit].push(c);
  return bySuit;
}

function isNilSafe(hand: Card[]): { safe: boolean; reason: string } {
  const bySuit = countBySuit(hand);
  const spades = bySuit.SPADES;
  const hasAceSpades = hasRank(hand, 'A') && spades.some(c => c.rank === 'A');
  
  // If holding Ace of Spades, nil is forbidden
  if (hasAceSpades) {
    return { safe: false, reason: 'Ace of Spades' };
  }
  
  // Check for dangerous high cards
  const dangerousCards = hand.filter(c => 
    (c.rank === 'A' && c.suit !== 'SPADES') ||
    (c.rank === 'K' && c.suit !== 'SPADES') ||
    (c.rank === 'Q' && c.suit !== 'SPADES')
  );
  
  // If too many dangerous cards, nil is risky
  if (dangerousCards.length > 2) {
    return { safe: false, reason: `Too many high cards: ${dangerousCards.length}` };
  }
  
  // If very few spades, nil is risky
  if (spades.length < 2) {
    return { safe: false, reason: `Too few spades: ${spades.length}` };
  }
  
  return { safe: true, reason: 'Nil appears safe' };
}

export function getBid4OrNil(input: Bid4OrNilInput): Bid4OrNilResult {
  const { hand } = input;
  
  // Check if nil is safe
  const nilCheck = isNilSafe(hand);
  
  if (nilCheck.safe) {
    return { bid: 0, reason: `Bid 4 or Nil: nil is safe (${nilCheck.reason})` };
  } else {
    return { bid: 4, reason: `Bid 4 or Nil: nil not safe (${nilCheck.reason}), bid 4` };
  }
}
