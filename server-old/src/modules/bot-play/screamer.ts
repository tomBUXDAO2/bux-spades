import type { Game, Card, Suit } from '../../types/game';

export interface ScreamerPlayInput {
  game: Game;
  hand: Card[];
  seatIndex: number;
  currentTrick: Card[];
  isLeading: boolean;
}

export interface ScreamerPlayResult {
  card: Card;
  reason: string;
}

/**
 * SCREAMER LOGIC: Players can only play a spade if they ONLY have spades left in their hand
 * Exception: Can play spades when following the lead suit (if spades are led)
 * Void in lead suit: Cannot play spades if they have other suits available
 * Leading: Cannot lead spades if they have other suits in hand
 */
export function getScreamerPlay({ game, hand, seatIndex, currentTrick, isLeading }: ScreamerPlayInput): ScreamerPlayResult {
  console.log(`[SCREAMER DEBUG] Bot ${game.players[seatIndex]?.username} making play decision`);
  console.log(`[SCREAMER DEBUG] Hand:`, hand.map(c => `${c.rank}${c.suit}`));
  console.log(`[SCREAMER DEBUG] Current trick:`, currentTrick.map(c => `${c.rank}${c.suit}`));
  console.log(`[SCREAMER DEBUG] Is leading:`, isLeading);

  if (isLeading) {
    // Leading: Cannot lead spades if you have other suits in hand
    const spades = hand.filter(card => card.suit === 'SPADES');
    const nonSpades = hand.filter(card => card.suit !== 'SPADES');
    
    if (nonSpades.length > 0) {
      // Have other suits, cannot lead spades
      const card = nonSpades[Math.floor(Math.random() * nonSpades.length)];
      return {
        card,
        reason: `Screamer: Cannot lead spades when other suits available, leading ${card.rank}${card.suit}`
      };
    } else {
      // Only spades left, can lead spades
      const card = spades[Math.floor(Math.random() * spades.length)];
      return {
        card,
        reason: `Screamer: Only spades left, leading ${card.rank}${card.suit}`
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
        reason: `Screamer: Following suit with ${card.rank}${card.suit}`
      };
    } else {
      // Void in lead suit - cannot play spades if you have other suits
      const spades = hand.filter(card => card.suit === 'SPADES');
      const nonSpades = hand.filter(card => card.suit !== 'SPADES');
      
      if (nonSpades.length > 0) {
        // Have other suits, cannot play spades
        const card = nonSpades[Math.floor(Math.random() * nonSpades.length)];
        return {
          card,
          reason: `Screamer: Void in ${leadSuit}, cannot play spades when other suits available, playing ${card.rank}${card.suit}`
        };
      } else {
        // Only spades left, can play spades
        const card = spades[Math.floor(Math.random() * spades.length)];
        return {
          card,
          reason: `Screamer: Void in ${leadSuit}, only spades left, playing ${card.rank}${card.suit}`
        };
      }
    }
  }
}

/**
 * HUMAN PLAYER LOGIC: Determine which cards are playable for human players in Screamer mode
 */
export function getScreamerPlayableCards(game: Game, hand: Card[], isLeading: boolean, currentTrick: Card[]): Card[] {
  if (!Array.isArray(hand) || !hand.length) return [];

  if (isLeading) {
    // Leading: Cannot lead spades if you have other suits in hand
    const spades = hand.filter(card => card.suit === 'SPADES');
    const nonSpades = hand.filter(card => card.suit !== 'SPADES');
    
    if (nonSpades.length > 0) {
      // Have other suits, cannot lead spades
      return nonSpades;
    } else {
      // Only spades left, can lead spades
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
      // Void in lead suit - cannot play spades if you have other suits
      const spades = hand.filter(card => card.suit === 'SPADES');
      const nonSpades = hand.filter(card => card.suit !== 'SPADES');
      
      if (nonSpades.length > 0) {
        // Have other suits, cannot play spades
        return nonSpades;
      } else {
        // Only spades left, can play spades
        return hand;
      }
    }
  }
}
