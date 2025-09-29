import type { Card, Suit } from '../../types/game';

export interface NilPlayInput {
  hand: Card[];
  currentTrick: Card[];
  leadSuit: Suit | null;
  spadesBroken: boolean;
  playerIndex: number;
  isLeading: boolean;
  playOrder: number[]; // Array of player indices in play order for current trick
}

export interface NilPlayResult {
  selectedCard: Card;
  reason: string;
}

/**
 * Determines the best card to play when a bot has bid nil
 * Goal: Avoid winning any tricks
 */
export function getNilPlay(input: NilPlayInput): NilPlayResult {
  const { hand, currentTrick, leadSuit, spadesBroken, playerIndex, isLeading, playOrder } = input;
  
  if (isLeading) {
    return getNilLead(hand);
  }
  
  if (leadSuit && hasSuit(hand, leadSuit)) {
    return getNilFollowSuit(hand, leadSuit, currentTrick);
  }
  
  // Void in lead suit
  if (leadSuit && !hasSuit(hand, leadSuit)) {
    return getNilVoidPlay(hand, currentTrick, spadesBroken, playOrder);
  }
  
  // Fallback (shouldn't happen)
  return {
    selectedCard: hand[0],
    reason: 'Nil: fallback selection'
  };
}

/**
 * Nil bot leading - play 2nd lowest card in longest suit
 */
function getNilLead(hand: Card[]): NilPlayResult {
  const suitCounts = countBySuit(hand);
  
  // Find longest suit
  let longestSuit: Suit = 'SPADES';
  let maxLength = suitCounts.SPADES.length;
  
  for (const [suit, cards] of Object.entries(suitCounts)) {
    if (cards.length > maxLength) {
      maxLength = cards.length;
      longestSuit = suit as Suit;
    }
  }
  
  const longestSuitCards = suitCounts[longestSuit];
  
  if (longestSuitCards.length < 2) {
    // Only one card in longest suit, play it
    return {
      selectedCard: longestSuitCards[0],
      reason: `Nil lead: only card in longest suit (${longestSuit})`
    };
  }
  
  // Sort by rank value and take 2nd lowest
  const sortedCards = sortByRankValue(longestSuitCards);
  const secondLowest = sortedCards[1];
  
  return {
    selectedCard: secondLowest,
    reason: `Nil lead: 2nd lowest in longest suit (${longestSuit})`
  };
}

/**
 * Nil bot following suit - play highest card that won't win
 */
function getNilFollowSuit(hand: Card[], leadSuit: Suit, currentTrick: Card[]): NilPlayResult {
  const leadSuitCards = hand.filter(card => card.suit === leadSuit);
  
  if (leadSuitCards.length === 0) {
    // Shouldn't happen if we have the suit
    return {
      selectedCard: hand[0],
      reason: 'Nil follow: no cards in lead suit (error)'
    };
  }
  
  // Find highest card currently on table in lead suit
  const leadSuitTrickCards = currentTrick.filter(card => card.suit === leadSuit);
  const highestTrickCard = leadSuitTrickCards.length > 0 
    ? leadSuitTrickCards.reduce((highest, card) => 
        getRankValue(card.rank) > getRankValue(highest.rank) ? card : highest
      )
    : null;
  
  const highestTrickValue = highestTrickCard ? getRankValue(highestTrickCard.rank) : 0;
  
  // Find highest card in our hand that won't win
  const sortedHand = sortByRankValue(leadSuitCards);
  let selectedCard = sortedHand[0]; // Default to lowest
  
  for (let i = sortedHand.length - 1; i >= 0; i--) {
    if (getRankValue(sortedHand[i].rank) < highestTrickValue) {
      selectedCard = sortedHand[i];
      break;
    }
  }
  
  return {
    selectedCard,
    reason: `Nil follow: highest card that won't win (${selectedCard.rank} vs ${highestTrickCard?.rank || 'none'})`
  };
}

/**
 * Nil bot void in lead suit - dump high cards strategically
 */
function getNilVoidPlay(hand: Card[], currentTrick: Card[], spadesBroken: boolean, playOrder: number[]): NilPlayResult {
  // Check if another void player played a spade
  const spadePlayedByVoid = currentTrick.some(card => 
    card.suit === 'SPADES' && 
    // Assume if spade is played and we're void, it's likely by another void player
    currentTrick.length > 1
  );
  
  if (spadePlayedByVoid) {
    return getNilVoidSpadeDump(hand, currentTrick);
  }
  
  // Regular void play - dump highest non-spade cards first
  const nonSpadeCards = hand.filter(card => card.suit !== 'SPADES');
  
  if (nonSpadeCards.length > 0) {
    const sortedNonSpades = sortByRankValue(nonSpadeCards);
    const highestNonSpade = sortedNonSpades[sortedNonSpades.length - 1];
    
    return {
      selectedCard: highestNonSpade,
      reason: `Nil void: dumping highest non-spade (${highestNonSpade.rank}${highestNonSpade.suit})`
    };
  }
  
  // Only spades left - play highest that won't win
  const spadeCards = hand.filter(card => card.suit === 'SPADES');
  const spadeTrickCards = currentTrick.filter(card => card.suit === 'SPADES');
  const highestSpadeTrick = spadeTrickCards.length > 0 
    ? spadeTrickCards.reduce((highest, card) => 
        getRankValue(card.rank) > getRankValue(highest.rank) ? card : highest
      )
    : null;
  
  const highestSpadeValue = highestSpadeTrick ? getRankValue(highestSpadeTrick.rank) : 0;
  const sortedSpades = sortByRankValue(spadeCards);
  
  let selectedSpade = sortedSpades[0]; // Default to lowest
  for (let i = sortedSpades.length - 1; i >= 0; i--) {
    if (getRankValue(sortedSpades[i].rank) < highestSpadeValue) {
      selectedSpade = sortedSpades[i];
      break;
    }
  }
  
  return {
    selectedCard: selectedSpade,
    reason: `Nil void: highest spade that won't win (${selectedSpade.rank} vs ${highestSpadeTrick?.rank || 'none'})`
  };
}

/**
 * Nil bot void play when spade was played by another void player
 */
function getNilVoidSpadeDump(hand: Card[], currentTrick: Card[]): NilPlayResult {
  const spadeCards = hand.filter(card => card.suit === 'SPADES');
  
  if (spadeCards.length === 0) {
    // No spades, play highest non-spade
    const nonSpadeCards = hand.filter(card => card.suit !== 'SPADES');
    const sortedNonSpades = sortByRankValue(nonSpadeCards);
    return {
      selectedCard: sortedNonSpades[sortedNonSpades.length - 1],
      reason: 'Nil void spade dump: no spades, playing highest non-spade'
    };
  }
  
  // Find highest spade on table
  const spadeTrickCards = currentTrick.filter(card => card.suit === 'SPADES');
  const highestSpadeTrick = spadeTrickCards.length > 0 
    ? spadeTrickCards.reduce((highest, card) => 
        getRankValue(card.rank) > getRankValue(highest.rank) ? card : highest
      )
    : null;
  
  const highestSpadeValue = highestSpadeTrick ? getRankValue(highestSpadeTrick.rank) : 0;
  const sortedSpades = sortByRankValue(spadeCards);
  
  // Play highest spade that won't win
  let selectedSpade = sortedSpades[0]; // Default to lowest
  for (let i = sortedSpades.length - 1; i >= 0; i--) {
    if (getRankValue(sortedSpades[i].rank) < highestSpadeValue) {
      selectedSpade = sortedSpades[i];
      break;
    }
  }
  
  return {
    selectedCard: selectedSpade,
    reason: `Nil void spade dump: highest spade that won't win (${selectedSpade.rank} vs ${highestSpadeTrick?.rank || 'none'})`
  };
}

// Helper functions
function countBySuit(hand: Card[]): Record<Suit, Card[]> {
  const bySuit: Record<Suit, Card[]> = {
    SPADES: [],
    HEARTS: [],
    DIAMONDS: [],
    CLUBS: []
  };
  
  for (const card of hand) {
    bySuit[card.suit].push(card);
  }
  
  return bySuit;
}

function hasSuit(hand: Card[], suit: Suit): boolean {
  return hand.some(card => card.suit === suit);
}

function sortByRankValue(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank));
}

function getRankValue(rank: string): number {
  const values: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return values[rank] || 0;
}
