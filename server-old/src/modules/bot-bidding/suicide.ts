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

function hasRank(hand: Card[], rank: Rank): boolean {
  return hand.some(c => c.rank === rank);
}

function getPartnerSeatIndex(seatIndex: number): number {
  return (seatIndex + 2) % 4;
}

function isFirstPartner(seatIndex: number, dealerIndex: number): boolean {
  const partnerSeatIndex = getPartnerSeatIndex(seatIndex);
  // First partner is the one who bids first in the rotation
  // Dealer + 1 goes first, then dealer + 2, etc.
  const firstBidder = (dealerIndex + 1) % 4;
  const secondBidder = (dealerIndex + 2) % 4;
  const thirdBidder = (dealerIndex + 3) % 4;
  const fourthBidder = dealerIndex;
  
  // Check if this seat is the first partner to bid
  if (seatIndex === firstBidder) {
    return partnerSeatIndex === thirdBidder; // Partner bids third
  } else if (seatIndex === secondBidder) {
    return partnerSeatIndex === fourthBidder; // Partner bids fourth
  } else if (seatIndex === thirdBidder) {
    return partnerSeatIndex === firstBidder; // Partner bids first
  } else { // seatIndex === fourthBidder
    return partnerSeatIndex === secondBidder; // Partner bids second
  }
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

  if (!partnerHasBid) {
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
      // Partner did NOT bid nil, we are FORCED to bid nil regardless of safety (suicide rule)
      return { bid: 0, reason: `Second partner: partner bid ${partnerBid}, FORCED to nil (suicide rule)` };
    }
  }
}
