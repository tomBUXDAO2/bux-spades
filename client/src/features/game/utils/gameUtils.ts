// Game utility functions for GameTable component
// These functions handle card operations, game logic, and team calculations

import type { Card, Suit, GameState, Player } from "../../../types/game";

/**
 * Get card rank value for sorting
 */
export const getCardValue = (rank: string | number): number => {
  // If rank is already a number, return it
  if (typeof rank === 'number') {
    return rank;
  }
  
  // Otherwise, convert string ranks to numbers
  const rankMap: { [key: string]: number } = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return rankMap[rank];
};

/**
 * Sort cards by suit and rank
 */
export const sortCards = (cards: Card[]): Card[] => {
  return [...cards].sort((a, b) => {
    const suitOrder = { "DIAMONDS": 0, "CLUBS": 1, "HEARTS": 2, "SPADES": 3 } as const;
    const suitA = (typeof a.suit === 'string' ? a.suit.toString().toUpperCase() : a.suit) as any;
    const suitB = (typeof b.suit === 'string' ? b.suit.toString().toUpperCase() : b.suit) as any;
    const keyA = suitA.startsWith('D') ? 'DIAMONDS' : suitA.startsWith('C') ? 'CLUBS' : suitA.startsWith('H') ? 'HEARTS' : 'SPADES';
    const keyB = suitB.startsWith('D') ? 'DIAMONDS' : suitB.startsWith('C') ? 'CLUBS' : suitB.startsWith('H') ? 'HEARTS' : 'SPADES';
    if (suitOrder[keyA] !== suitOrder[keyB]) {
      return suitOrder[keyA] - suitOrder[keyB];
    }
    return getCardValue(a.rank) - getCardValue(b.rank);
  });
};

/**
 * Get the lead suit from a trick
 */
export const getLeadSuit = (trick: Card[] | undefined): Suit | null => {
  if (!Array.isArray(trick) || trick.length === 0) return null;
  return trick[0].suit;
};

/**
 * Check if spades have been broken in the game
 */
export const hasSpadeBeenPlayed = (game: GameState): boolean => {
  // RACE CONDITION FIX: Check both the server's spadesBroken flag AND actual card data
  const spadesBroken = (game as any).play?.spadesBroken || false;
  
  // If spadesBroken flag is true, return true
  if (spadesBroken) {
    return true;
  }
  
  // RACE CONDITION FIX: Also check completed tricks for spades
  if (game.play?.completedTricks) {
    for (const trick of game.play.completedTricks) {
      if (trick.cards && trick.cards.some((card: any) => card.suit === 'SPADES')) {
        return true;
      }
    }
  }
  
  // RACE CONDITION FIX: Also check current trick for spades
  if (game.play?.currentTrick) {
    if (game.play.currentTrick.some((card: any) => card.suit === 'SPADES')) {
      return true;
    }
  }
  
  return false;
};

/**
 * Check if a card is a spade
 */
export const isSpade = (card: Card): boolean => {
  const suit = (card.suit as unknown as string).toUpperCase();
  return suit === 'SPADES' || suit === 'S' || suit === '♠';
};

/**
 * Count spades in a hand
 */
export const countSpades = (hand: Card[] | undefined): number => {
  if (!hand || !Array.isArray(hand)) return 0;
  return Array.isArray(hand) ? hand.filter(isSpade).length : 0;
};

/**
 * Determine if the current user can invite a bot for a seat
 */
export const canInviteBot = ({
  gameState,
  currentPlayerId,
  seatIndex,
  isPreGame,
  sanitizedPlayers,
  isBot,
}: {
  gameState: GameState;
  currentPlayerId: string;
  seatIndex: number;
  isPreGame: boolean;
  sanitizedPlayers: (Player | null)[];
  isBot: (player: any) => boolean;
}): boolean => {
  if (!currentPlayerId) return false;
  if (isPreGame) {
    // For WAITING games, any human player can invite bots to empty seats
    return gameState.status === 'WAITING';
  } else {
    // Mid-game: only the partner of the empty seat can invite a bot
    // Partner is seat (seatIndex + 2) % 4
    const partnerIndex = (seatIndex + 2) % 4;
    const partner = sanitizedPlayers[partnerIndex];
    
    // Check if partner is human (not bot)
    if (partner && isBot(partner)) {
      // If partner is a bot, only the host (seat 0) can invite bots
      return sanitizedPlayers[0]?.id === currentPlayerId && (gameState.status === 'PLAYING' || gameState.status === 'BIDDING');
    } else {
      // If partner is human, only the partner can invite bots
      return partner?.id === currentPlayerId && (gameState.status === 'PLAYING' || gameState.status === 'BIDDING');
    }
  }
};

/**
 * Determine user's team
 */
export const getUserTeam = (gameState: GameState, userId: string): number => {
  const myPlayerIndex = gameState.players ? gameState.players?.findIndex((p: any) => p && (p.id === userId || p.userId === userId)) : -1;
  if (myPlayerIndex === -1) return 1; // Default to team 1
  
  // In partners mode: positions 0,2 = Red Team (1), positions 1,3 = Blue Team (2)
  return myPlayerIndex === 0 || myPlayerIndex === 2 ? 1 : 2;
};

/**
 * Get playable cards for a player
 */
export const getPlayableCards = (
  gameState: GameState, 
  hand: Card[], 
  isLeading: boolean,
  trickCompleted: boolean
): Card[] => {
  if (!hand || hand.length === 0) return [];
  
  const specialRules = (gameState as any).specialRules || {};
  const spadesBroken = hasSpadeBeenPlayed(gameState);
  
  // If not leading, must follow suit
  if (!isLeading && gameState.play?.currentTrick && gameState.play.currentTrick.length > 0) {
    const leadSuit = getLeadSuit(gameState.play.currentTrick);
    if (leadSuit) {
      // Check if player has cards in the lead suit
      const leadSuitCards = hand.filter(card => card.suit === leadSuit);
      
      // If player has cards in lead suit, must play one of them
      if (leadSuitCards.length > 0) {
        return leadSuitCards;
      }
      // If player is void in lead suit
      else {
        let playableCards = hand;
        
        // ASSASSIN: Must cut with spades when void in lead suit
        if (specialRules.assassin) {
          const spades = hand.filter(card => card.suit === 'SPADES');
          if (spades.length > 0) {
            playableCards = spades; // MUST play spades
          }
        }
        
        // SCREAMER: Cannot play spades unless only have spades
        if (specialRules.screamer) {
          const nonSpades = hand.filter(card => card.suit !== 'SPADES');
          if (nonSpades.length > 0) {
            playableCards = playableCards.filter(card => card.suit !== 'SPADES');
          }
        }
        
        return playableCards;
      }
    }
  }
  
  // If leading
  if (isLeading) {
    let playableCards = hand;
    
    // ASSASSIN: Must lead spades if spades are broken and player has spades
    if (specialRules.assassin && spadesBroken) {
      const spades = hand.filter(card => card.suit === 'SPADES');
      if (spades.length > 0) {
        playableCards = spades; // MUST lead spades
      }
    }
    
    // SCREAMER: Cannot lead spades unless only have spades (spadesBroken doesn't override this)
    if (specialRules.screamer) {
      const nonSpades = hand.filter(card => card.suit !== 'SPADES');
      if (nonSpades.length > 0) {
        playableCards = playableCards.filter(card => card.suit !== 'SPADES');
      }
    }
    
    return playableCards;
  }
  
  // Fallback
  return hand;
};
