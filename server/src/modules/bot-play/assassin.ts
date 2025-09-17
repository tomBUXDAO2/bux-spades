import type { Game, Card, Suit } from '../../types/game';

export interface AssassinPlayInput {
  game: Game;
  hand: Card[];
  seatIndex: number;
  currentTrick: Card[];
  isLeading: boolean;
}

export interface AssassinPlayResult {
  card: Card;
  reason: string;
}

/**
 * ASSASSIN LOGIC: Opposite of Screamer
 * When void in lead suit: MUST play a spade if available
 * When leading: MUST play a spade if available
 */
export function getAssassinPlay({ game, hand, seatIndex, currentTrick, isLeading }: AssassinPlayInput): AssassinPlayResult {
  console.log(`[ASSASSIN DEBUG] Bot ${game.players[seatIndex]?.username} making play decision`);
  console.log(`[ASSASSIN DEBUG] Hand:`, hand.map(c => `${c.rank}${c.suit}`));
  console.log(`[ASSASSIN DEBUG] Current trick:`, currentTrick.map(c => `${c.rank}${c.suit}`));
  console.log(`[ASSASSIN DEBUG] Is leading:`, isLeading);

  if (isLeading) {
    // Leading: MUST play a spade if available
    const spades = hand.filter(card => card.suit === 'SPADES');
    
    if (spades.length > 0) {
      // Have spades, must lead spades
      const card = spades[Math.floor(Math.random() * spades.length)];
      return {
        card,
        reason: `Assassin: Must lead spades when available, leading ${card.rank}${card.suit}`
      };
    } else {
      // No spades, can lead anything
      const card = hand[Math.floor(Math.random() * hand.length)];
      return {
        card,
        reason: `Assassin: No spades available, leading ${card.rank}${card.suit}`
      };
    }
  } else {
    // Following: Must follow suit if possible
    const leadSuit = currentTrick[0].suit;
    const followSuitCards = hand.filter(card => card.suit === leadSuit);
    
    if (followSuitCards.length > 0) {
      // Can follow suit
      const card = followSuitCards[Math.floor(Math.random() * followSuitCards.length)];
      return {
        card,
        reason: `Assassin: Following suit with ${card.rank}${card.suit}`
      };
    } else {
      // Void in lead suit - MUST play a spade if available
      const spades = hand.filter(card => card.suit === 'SPADES');
      
      if (spades.length > 0) {
        // Have spades, must play spades
        const card = spades[Math.floor(Math.random() * spades.length)];
        return {
          card,
          reason: `Assassin: Void in ${leadSuit}, must play spades when available, playing ${card.rank}${card.suit}`
        };
      } else {
        // No spades, can play anything
        const card = hand[Math.floor(Math.random() * hand.length)];
        return {
          card,
          reason: `Assassin: Void in ${leadSuit}, no spades available, playing ${card.rank}${card.suit}`
        };
      }
    }
  }
}

/**
 * HUMAN PLAYER LOGIC: Determine which cards are playable for human players in Assassin mode
 */
export function getAssassinPlayableCards(game: Game, hand: Card[], isLeading: boolean, currentTrick: Card[]): Card[] {
  if (!Array.isArray(hand) || !hand.length) return [];

  if (isLeading) {
    // Leading: MUST play a spade if available
    const spades = hand.filter(card => card.suit === 'SPADES');
    
    if (spades.length > 0) {
      // Have spades, must lead spades
      return spades;
    } else {
      // No spades, can lead anything
      return hand;
    }
  } else {
    // Following: Must follow suit if possible
    const leadSuit = currentTrick[0].suit;
    const followSuitCards = hand.filter(card => card.suit === leadSuit);
    
    if (followSuitCards.length > 0) {
      // Can follow suit
      return followSuitCards;
    } else {
      // Void in lead suit - MUST play a spade if available
      const spades = hand.filter(card => card.suit === 'SPADES');
      
      if (spades.length > 0) {
        // Have spades, must play spades
        return spades;
      } else {
        // No spades, can play anything
        return hand;
      }
    }
  }
}
