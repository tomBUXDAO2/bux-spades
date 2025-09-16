import type { Card, Rank, Suit } from '../../types/game';

export interface RegularBidInput {
  hand: Card[];
  seatIndex: number; // 0..3
  existingBids: Array<number | null>; // length 4, null for not yet bid
}

export interface RegularBidResult {
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

function maxRankInSuit(cards: Card[]): Rank | null {
  if (cards.length === 0) return null;
  return cards.reduce((max, c) => (rankValue[c.rank] > rankValue[max] ? c.rank : max), cards[0].rank);
}

function estimateTricksRegular(hand: Card[]): number {
  const bySuit = countBySuit(hand);
  let est = 0;

  // Non-spade sure-ish winners with revised rules
  for (const suit of ['HEARTS','DIAMONDS','CLUBS'] as Suit[]) {
    const cards = bySuit[suit];
    const len = cards.length;
    const ranks = cards.map(c => c.rank);

    // Ace likely wins regardless of length
    if (ranks.includes('A')) est += 1;

    // King counts only when suit length <= 3 (Kings in long suits are fragile)
    if (ranks.includes('K') && len > 0 && len <= 3) est += 1;

    // Queen gets partial credit only with depth (len >= 3)
    if (ranks.includes('Q') && len >= 3) est += 0.5;
  }

  // Spade winners with revised rules
  const spRanks = bySuit.SPADES.map(c => c.rank);
  const spLen = bySuit.SPADES.length;

  if (spRanks.includes('A')) est += 1;
  if (spRanks.includes('K')) est += 1;

  // Q♠ counts fully when there are at least 3 spades (protectable),
  // half a trick if exactly 2 spades, otherwise 0
  if (spRanks.includes('Q')) {
    if (spLen >= 3) est += 1;
    else if (spLen === 2) est += 0.5;
  }

  // If holding 5+ spades and A♠, treat J♠ as +1 additional likely winner
  if (spLen >= 5 && spRanks.includes('A') && spRanks.includes('J')) {
    est += 1;
  }

  // Distribution bonus: potential for cutting later
  const shortClubs = bySuit.CLUBS.length <= 2;
  const shortHearts = bySuit.HEARTS.length <= 2;
  const shortDiamonds = bySuit.DIAMONDS.length <= 2;

  // Suppress singleton-cut bonus if exactly 3 spades with Q♠ (need spades to protect Q)
  const shouldSuppressCutBonus = spLen === 3 && spRanks.includes('Q');

  if (!shouldSuppressCutBonus) {
    if (spLen >= 4 && (shortClubs || shortHearts || shortDiamonds)) est += 0.5;
  }

  // Use conservative rounding down
  return Math.max(0, Math.floor(est));
}

function isNilSafe(hand: Card[]): { safe: boolean; reason: string } {
  const bySuit = countBySuit(hand);

  // Never nil if holding Ace of Spades or both K and Q of Spades
  const spRanks = bySuit.SPADES.map(c => c.rank);
  if (spRanks.includes('A')) return { safe: false, reason: 'Holds Ace of Spades' };
  if (spRanks.includes('K') && spRanks.includes('Q')) return { safe: false, reason: 'Holds K and Q of Spades' };

  const highestSpade = maxRankInSuit(bySuit.SPADES);
  const spHighVal = highestSpade ? rankValue[highestSpade] : 0;

  // Disallow nil if highest spade is J or higher
  if (spHighVal >= rankValue['J']) return { safe: false, reason: 'Spade honor too high' };

  // Non-spade Ace rule (allow if Ace sits in a long suit, len >= 5)
  const nonSpadeAces: Array<{ suit: Suit; len: number }> = [];
  (['CLUBS','HEARTS','DIAMONDS'] as Suit[]).forEach(s => {
    const ranks = bySuit[s].map(c => c.rank);
    if (ranks.includes('A')) nonSpadeAces.push({ suit: s, len: bySuit[s].length });
  });
  const hasUnsafeNonSpadeAce = nonSpadeAces.some(x => x.len <= 4);
  if (hasUnsafeNonSpadeAce) return { safe: false, reason: 'Non-spade Ace without long-suit protection' };

  // Prefer nil when short, weak spades
  const spLen = bySuit.SPADES.length;
  if (spLen <= 2) return { safe: true, reason: 'Short, weak spades; non-spade Aces (if any) are protected by length' };

  return { safe: false, reason: 'Spade length or honors unsafe' };
}

export function getRegularBid(input: RegularBidInput): RegularBidResult {
  const { hand, seatIndex, existingBids } = input;
  const bySuit = countBySuit(hand);

  // Consider Nil first (0), subject to safety rules
  const nilCheck = isNilSafe(hand);

  // Base estimation if not nil
  let est = estimateTricksRegular(hand);

  const spLen = bySuit.SPADES.length;
  const spRanks = bySuit.SPADES.map(c => c.rank);

  // First-bidder conservatism: if weak spades (<=1) and no clear outside power, bias down by 1 (min 1)
  const isFirstBidder = seatIndex === 2 || seatIndex === 0; // server sets first bidder by dealer; cover common seats
  const hasOutsidePower = ['HEARTS','DIAMONDS','CLUBS'].some(s => bySuit[s as Suit].some(c => c.rank === 'A'));
  if (isFirstBidder && spLen <= 1 && !hasOutsidePower) {
    est = Math.max(1, est - 1);
  }

  // Final bidder awareness: try not to leave table bid < 10 when reasonable
  const isFinalBidder = seatIndex === 3;
  const currentSum = existingBids.reduce((s, b) => s + (b || 0), 0);

  if (nilCheck.safe) {
    return { bid: 0, reason: `Nil safe: ${nilCheck.reason}` };
  }

  // Clamp estimate between 1 and 6 to avoid extremes
  est = Math.min(6, Math.max(1, est));

  if (isFinalBidder) {
    const projected = currentSum + est;
    // Only stretch if hand has genuine strength: 5+ spades or A♠ or at least one non-spade Ace in a short suit (<=3)
    const hasStrongSpadeBackbone = spLen >= 5 || spRanks.includes('A');
    const hasShortSuitAce = (['HEARTS','DIAMONDS','CLUBS'] as Suit[]).some(s => bySuit[s].length <= 3 && bySuit[s].some(c => c.rank === 'A'));
    const canStretch = hasStrongSpadeBackbone || hasShortSuitAce;

    if (projected < 10 && est < 4 && canStretch) {
      est = Math.min(4, est + 1);
      return { bid: est, reason: `Final bidder stretch with strength (table <10)` };
    }
  }

  return { bid: est, reason: 'Regular heuristic based on revised K/Q rules, spades length, and distribution' };
} 