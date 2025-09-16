import type { Card, Rank, Suit } from '../../types/game';
import { getRegularBid } from './regular';

export interface SuicideBidInput {
  hand: Card[];
  seatIndex: number; // 0..3
  existingBids: Array<number | null>; // length 4, null for not yet bid
}

export interface SuicideBidResult {
  bid: number; // use 0 for NILL
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

function isNilForbidden(hand: Card[]): { forbidden: boolean; reason: string } {
  const bySuit = countBySuit(hand);
  const spRanks = bySuit.SPADES.map(c => c.rank);
  const spLen = bySuit.SPADES.length;

  // Never nil with Ace of Spades
  if (spRanks.includes('A')) {
    return { forbidden: true, reason: 'Holds Ace of Spades' };
  }

  // Never nil with both K and Q of Spades
  if (spRanks.includes('K') && spRanks.includes('Q')) {
    return { forbidden: true, reason: 'Holds K and Q of Spades' };
  }

  // Never nil with 5 or more spades
  if (spLen >= 5) {
    return { forbidden: true, reason: 'Holds 5 or more spades' };
  }

  return { forbidden: false, reason: 'Nil allowed' };
}

function getPartnerSeatIndex(seatIndex: number): number {
  return (seatIndex + 2) % 4;
}

function isFirstPartner(seatIndex: number): boolean {
  // In partners mode, seats 0&2 are team 0, seats 1&3 are team 1
  // First partner is the one who bids first (lower seat index)
  return seatIndex === 0 || seatIndex === 1;
}

export function getSuicideBid(input: SuicideBidInput): SuicideBidResult {
  const { hand, seatIndex, existingBids } = input;
  
  const partnerSeatIndex = getPartnerSeatIndex(seatIndex);
  const partnerBid = existingBids[partnerSeatIndex];
  const isFirstPartnerToBid = isFirstPartner(seatIndex);
  const partnerHasBid = partnerBid !== null;

  // Get regular bid for reference
  const regularResult = getRegularBid({ hand, seatIndex, existingBids });
  const regularBid = regularResult.bid;

  // Check if nil is forbidden for this hand
  const nilCheck = isNilForbidden(hand);

  if (isFirstPartnerToBid) {
    // FIRST PARTNER LOGIC
    console.log(`[SUICIDE BOT] First partner (seat ${seatIndex}) bidding...`);
    
    // If regular bid would be less than 3 and nil is not forbidden, bid nil
    if (regularBid < 3 && !nilCheck.forbidden) {
      return { bid: 0, reason: `First partner: regular bid ${regularBid} < 3, nil safe` };
    }
    
    // If nil is forbidden, must bid regular + 1
    if (nilCheck.forbidden) {
      const adjustedBid = Math.min(6, regularBid + 1);
      return { bid: adjustedBid, reason: `First partner: nil forbidden (${nilCheck.reason}), regular ${regularBid} + 1` };
    }
    
    // If regular bid >= 3, add 1 to regular bid
    const adjustedBid = Math.min(6, regularBid + 1);
    return { bid: adjustedBid, reason: `First partner: regular bid ${regularBid} >= 3, adding 1` };
    
  } else {
    // SECOND PARTNER LOGIC
    console.log(`[SUICIDE BOT] Second partner (seat ${seatIndex}) bidding, partner bid: ${partnerBid}`);
    
    if (!partnerHasBid) {
      // Partner hasn't bid yet (shouldn't happen in normal flow)
      return { bid: 0, reason: 'Second partner: partner has not bid yet, defaulting to nil' };
    }
    
    if (partnerBid === 0) {
      // Partner bid nil, we can bid whatever we like (regular + 1)
      const adjustedBid = Math.min(6, regularBid + 1);
      return { bid: adjustedBid, reason: `Second partner: partner bid nil, regular ${regularBid} + 1` };
    } else {
      // Partner did NOT bid nil, we are FORCED to bid nil
      if (nilCheck.forbidden) {
        // This is a problem - we're forced to nil but it's forbidden
        // In this case, bid 1 as a fallback
        return { bid: 1, reason: `Second partner: FORCED nil but forbidden (${nilCheck.reason}), fallback to 1` };
      }
      return { bid: 0, reason: `Second partner: partner bid ${partnerBid}, FORCED to nil` };
    }
  }
}
