import type { Card, Suit } from '../../types/game';

export interface NilCoverPlayInput {
  hand: Card[];
  currentTrick: Card[];
  leadSuit: Suit | null;
  spadesBroken: boolean;
  playerIndex: number;
  isLeading: boolean;
  nilPartnerIndex: number;
  playOrder: number[]; // Array of player indices in play order for current trick
}

export interface NilCoverPlayResult {
  selectedCard: Card;
  reason: string;
}

/**
 * Determines the best card to play when a bot's partner has bid nil
 * Goal: Help partner avoid winning tricks while maximizing team score
 */
export function getNilCoverPlay(input: NilCoverPlayInput): NilCoverPlayResult {
  const { hand, currentTrick, leadSuit, spadesBroken, playerIndex, isLeading, nilPartnerIndex, playOrder } = input;
  
  if (isLeading) {
    return getNilCoverLead(hand, spadesBroken);
  }
  
  const partnerPlayedBefore = playOrder.indexOf(nilPartnerIndex) < playOrder.indexOf(playerIndex);
  
  if (partnerPlayedBefore) {
    // Partner already played - play low to not waste spades
    return getNilCoverAfterPartner(hand, leadSuit, currentTrick);
  } else {
    // Partner hasn't played yet - play high so partner can dump
    return getNilCoverBeforePartner(hand, leadSuit, currentTrick);
  }
}

/**
 * Nil cover bot leading - lead highest spades if broken, otherwise strategic lead
 */
function getNilCoverLead(hand: Card[], spadesBroken: boolean): NilCoverPlayResult {
  if (spadesBroken) {
    // Lead highest spades to help partner dump
    const spadeCards = hand.filter(card => card.suit === 'SPADES');
    
    if (spadeCards.length > 0) {
      const sortedSpades = sortByRankValue(spadeCards);
      const highestSpade = sortedSpades[sortedSpades.length - 1];
      
      return {
        selectedCard: highestSpade,
        reason: `Nil cover lead: highest spade (${highestSpade.rank}${highestSpade.suit}) - spades broken`
      };
    }
  }
  
  // No spades or spades not broken - lead strategically
  // Lead a medium card in a suit we have multiple of
  const suitCounts = countBySuit(hand);
  
  // Find suit with 2+ cards, prefer non-spades
  let bestSuit: Suit | null = null;
  let bestCount = 0;
  
  for (const [suit, cards] of Object.entries(suitCounts)) {
    if (cards.length >= 2 && cards.length > bestCount) {
      if (suit !== 'SPADES' || spadesBroken) {
        bestSuit = suit as Suit;
        bestCount = cards.length;
      }
    }
  }
  
  if (bestSuit) {
    const suitCards = suitCounts[bestSuit];
    const sortedCards = sortByRankValue(suitCards);
    // Play middle card
    const middleIndex = Math.floor(sortedCards.length / 2);
    const selectedCard = sortedCards[middleIndex];
    
    return {
      selectedCard,
      reason: `Nil cover lead: middle card in ${bestSuit} (${selectedCard.rank}${selectedCard.suit})`
    };
  }
  
  // Fallback - play lowest card
  const sortedHand = sortByRankValue(hand);
  return {
    selectedCard: sortedHand[0],
    reason: 'Nil cover lead: fallback to lowest card'
  };
}

/**
 * Nil cover bot playing BEFORE partner - play high so partner can dump
 */
function getNilCoverBeforePartner(hand: Card[], leadSuit: Suit | null, currentTrick: Card[]): NilCoverPlayResult {
  if (leadSuit && hasSuit(hand, leadSuit)) {
    // Following suit - play high to help partner dump
    const leadSuitCards = hand.filter(card => card.suit === leadSuit);
    const sortedCards = sortByRankValue(leadSuitCards);
    
    // Find highest card that might win (to help partner dump)
    const highestCard = sortedCards[sortedCards.length - 1];
    
    return {
      selectedCard: highestCard,
      reason: `Nil cover before partner: highest ${leadSuit} (${highestCard.rank}${highestCard.suit}) to help partner dump`
    };
  }
  
  // Void in lead suit - play high non-spade to help partner dump
  const nonSpadeCards = hand.filter(card => card.suit !== 'SPADES');
  
  if (nonSpadeCards.length > 0) {
    const sortedNonSpades = sortByRankValue(nonSpadeCards);
    const highestNonSpade = sortedNonSpades[sortedNonSpades.length - 1];
    
    return {
      selectedCard: highestNonSpade,
      reason: `Nil cover before partner: highest non-spade (${highestNonSpade.rank}${highestNonSpade.suit}) to help partner dump`
    };
  }
  
  // Only spades left - play highest
  const spadeCards = hand.filter(card => card.suit === 'SPADES');
  const sortedSpades = sortByRankValue(spadeCards);
  const highestSpade = sortedSpades[sortedSpades.length - 1];
  
  return {
    selectedCard: highestSpade,
    reason: `Nil cover before partner: highest spade (${highestSpade.rank}${highestSpade.suit}) to help partner dump`
  };
}

/**
 * Nil cover bot playing AFTER partner - play low to not waste spades
 */
function getNilCoverAfterPartner(hand: Card[], leadSuit: Suit | null, currentTrick: Card[]): NilCoverPlayResult {
  if (leadSuit && hasSuit(hand, leadSuit)) {
    // Following suit - play low to not waste spades
    const leadSuitCards = hand.filter(card => card.suit === leadSuit);
    const sortedCards = sortByRankValue(leadSuitCards);
    
    // Find lowest card that won't win
    const leadSuitTrickCards = currentTrick.filter(card => card.suit === leadSuit);
    const highestTrickCard = leadSuitTrickCards.length > 0 
      ? leadSuitTrickCards.reduce((highest, card) => 
          getRankValue(card.rank) > getRankValue(highest.rank) ? card : highest
        )
      : null;
    
    const highestTrickValue = highestTrickCard ? getRankValue(highestTrickCard.rank) : 0;
    
    // Play lowest card that won't win
    let selectedCard = sortedCards[0]; // Default to lowest
    for (let i = 0; i < sortedCards.length; i++) {
      if (getRankValue(sortedCards[i].rank) < highestTrickValue) {
        selectedCard = sortedCards[i];
        break;
      }
    }
    
    return {
      selectedCard,
      reason: `Nil cover after partner: lowest ${leadSuit} that won't win (${selectedCard.rank}${selectedCard.suit})`
    };
  }
  
  // Void in lead suit - play low non-spade
  const nonSpadeCards = hand.filter(card => card.suit !== 'SPADES');
  
  if (nonSpadeCards.length > 0) {
    const sortedNonSpades = sortByRankValue(nonSpadeCards);
    const lowestNonSpade = sortedNonSpades[0];
    
    return {
      selectedCard: lowestNonSpade,
      reason: `Nil cover after partner: lowest non-spade (${lowestNonSpade.rank}${lowestNonSpade.suit})`
    };
  }
  
  // Only spades left - play lowest
  const spadeCards = hand.filter(card => card.suit === 'SPADES');
  const sortedSpades = sortByRankValue(spadeCards);
  const lowestSpade = sortedSpades[0];
  
  return {
    selectedCard: lowestSpade,
    reason: `Nil cover after partner: lowest spade (${lowestSpade.rank}${lowestSpade.suit})`
  };
}

// Helper functions (same as nil.ts)
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
