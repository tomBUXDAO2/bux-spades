import type { Card, Rank, Suit } from '../../types/game';

export interface WhizBidInput {
  hand: Card[];
  seatIndex: number; // 0..3
  existingBids: Array<number | null>; // length 4, null for not yet bid
  game: any; // Game object to access partner info
}

export interface WhizBidResult {
  bid: number; // number of spades or 0 for nil
  reason: string;
}

const rankValue: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

function countBySuit(hand: Card[]) {
  const bySuit: Record<Suit, Card[]> = { SPADES: [], HEARTS: [], DIAMONDS: [], CLUBS: [] };
  for (const c of hand) bySuit[c.suit].push(c);
  for (const s of Object.keys(bySuit) as Suit[]) {
    bySuit[s].sort((a, b) => rankValue[a.rank] - rankValue[b.rank]);
  }
  return bySuit;
}

function hasRank(hand: Card[], suit: Suit, ranks: Rank[]): boolean {
  return hand.some(c => c.suit === suit && ranks.includes(c.rank));
}

function getPartnerIndex(seatIndex: number): number {
  return (seatIndex + 2) % 4;
}

function getPartnerBid(existingBids: Array<number | null>, seatIndex: number): number | null {
  const partnerIndex = getPartnerIndex(seatIndex);
  return existingBids[partnerIndex];
}

function isNilSafe(hand: Card[], existingBids: Array<number | null>, seatIndex: number): { safe: boolean; reason: string } {
  const bySuit = countBySuit(hand);
  const spRanks = bySuit.SPADES.map(c => c.rank);
  const spLen = bySuit.SPADES.length;
  const partnerBid = getPartnerBid(existingBids, seatIndex);

  // NEVER bid nil if holding Ace of spades
  if (spRanks.includes('A')) {
    return { safe: false, reason: 'Holds Ace of Spades' };
  }

  // NEVER bid nil with both K and Q of spades
  if (spRanks.includes('K') && spRanks.includes('Q')) {
    return { safe: false, reason: 'Holds both K and Q of Spades' };
  }

  // NEVER bid nil if they have 4 or more spades
  if (spLen >= 4) {
    return { safe: false, reason: 'Too many spades (4+)' };
  }

  // NEVER bid nil if they hold A or K in a suit that they only hold 2 cards in
  for (const suit of ['HEARTS', 'DIAMONDS', 'CLUBS'] as Suit[]) {
    const suitCards = bySuit[suit];
    const suitLen = suitCards.length;
    const suitRanks = suitCards.map(c => c.rank);
    
    if (suitLen === 2 && (suitRanks.includes('A') || suitRanks.includes('K'))) {
      return { safe: false, reason: `Holds A or K in short ${suit.toLowerCase()} suit (2 cards)` };
    }
  }

  // Partner bidding logic
  if (partnerBid !== null) {
    // If partner bids nil, NEVER bid nil too
    if (partnerBid === 0) {
      return { safe: false, reason: 'Partner already bid nil' };
    }

    // If partner's bid is more than the number of spades we hold, nil can be considered
    // (but still subject to the other nil rules above)
    if (partnerBid > spLen) {
      return { safe: true, reason: `Partner bid ${partnerBid} > our spades (${spLen}), nil safe` };
    }
  }

  // Default: nil is safe if we have 0-3 spades and no dangerous honors
  if (spLen <= 3) {
    return { safe: true, reason: `Safe nil with ${spLen} spades and no dangerous honors` };
  }

  return { safe: false, reason: 'Nil not safe due to spade count or honors' };
}

export function getWhizBid(input: WhizBidInput): WhizBidResult {
  const { hand, seatIndex, existingBids } = input;
  const bySuit = countBySuit(hand);
  const spLen = bySuit.SPADES.length;

  // In WHIZ, players must bid either nil (0) or the number of spades in their hand
  const nilCheck = isNilSafe(hand, existingBids, seatIndex);

  if (nilCheck.safe) {
    return { bid: 0, reason: `Nil: ${nilCheck.reason}` };
  }

  // If nil is not safe, bid the number of spades
  return { bid: spLen, reason: `Bid ${spLen} spades (nil not safe: ${nilCheck.reason})` };
}
