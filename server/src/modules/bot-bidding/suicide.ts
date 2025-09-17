import type { Card, Rank, Suit } from '../../types/game';
import { getRegularBid } from './regular';

export interface SuicideBidInput {
  hand: Card[];
  seatIndex: number; // 0..3
  existingBids: Array<number | null>; // length 4, null for not yet bid
  dealerIndex: number; // Current dealer position
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

function getBiddingOrder(dealerIndex: number): number[] {
  // Bidding order: dealer + 1, dealer + 2, dealer + 3, dealer
  const order = [];
  for (let i = 1; i <= 4; i++) {
    order.push((dealerIndex + i) % 4);
  }
  return order;
}

function isFirstPartner(seatIndex: number, dealerIndex: number): boolean {
  const partnerSeatIndex = getPartnerSeatIndex(seatIndex);
  const biddingOrder = getBiddingOrder(dealerIndex);
  
  // Find positions of both partners in bidding order
  const myPosition = biddingOrder.indexOf(seatIndex);
  const partnerPosition = biddingOrder.indexOf(partnerSeatIndex);
  
  // First partner is the one who bids first (lower position in bidding order)
  return myPosition < partnerPosition;
}

export function getSuicideBid(input: SuicideBidInput): SuicideBidResult {
  const { hand, seatIndex, existingBids, dealerIndex } = input;
  
  const partnerSeatIndex = getPartnerSeatIndex(seatIndex);
  const partnerBid = existingBids[partnerSeatIndex];
  const isFirstPartnerToBid = isFirstPartner(seatIndex, dealerIndex);
  const partnerHasBid = partnerBid !== null;

  // Get regular bid for reference - this includes proper nil safety checks
  const regularResult = getRegularBid({ hand, seatIndex, existingBids });
  const regularBid = regularResult.bid;

  console.log(`[SUICIDE BOT] Regular bid result:`, regularResult);

  if (isFirstPartnerToBid) {
    // FIRST PARTNER LOGIC
    console.log(`[SUICIDE BOT] First partner (seat ${seatIndex}) bidding...`);
    
    // NEVER override regular bidding's nil safety - if regular bid is not nil, respect it
    if (regularBid > 0) {
      // Regular bidding already determined this hand is not safe for nil
      const adjustedBid = Math.min(6, regularBid + 1);
      return { bid: adjustedBid, reason: `First partner: regular bid ${regularBid} (not nil-safe), adding 1` };
    }
    
    // If regular bid is 0 (nil), we can consider suicide logic
    // But still add 1 to the nil bid for suicide
    return { bid: 1, reason: `First partner: regular says nil safe, but suicide adds 1` };
    
  } else {
    // SECOND PARTNER LOGIC
    console.log(`[SUICIDE BOT] Second partner (seat ${seatIndex}) bidding, partner bid: ${partnerBid}`);
    
    if (!partnerHasBid) {
      // Partner hasn't bid yet (shouldn't happen in normal flow)
      return { bid: 0, reason: 'Second partner: partner has not bid yet, defaulting to nil' };
    }
    
    if (partnerBid === 0) {
      // Partner bid nil, we CANNOT bid nil (both partners can't be nil)
      // We must bid regular + 1
      const adjustedBid = Math.min(6, regularBid + 1);
      return { bid: adjustedBid, reason: `Second partner: partner bid nil, CANNOT bid nil, regular ${regularBid} + 1` };
    } else {
      // Partner did NOT bid nil, we are FORCED to bid nil regardless of safety
      return { bid: 0, reason: `Second partner: partner bid ${partnerBid}, FORCED to nil (suicide rule)` };
    }
  }
}
