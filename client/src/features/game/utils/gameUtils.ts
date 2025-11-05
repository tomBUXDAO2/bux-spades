// Game utility functions for GameTable component
// These functions handle card operations, game logic, and team calculations

import type { Card, Suit, GameState, Player } from "../../../types/game";

// Local cache to eliminate race conditions when the server hasn't
// yet persisted/propagated that spades are broken
const spadesBrokenCache: Record<string, boolean> = {};

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
  const gameId = (game as any)?.id || (game as any)?.gameId || 'unknown-game';
  const spadesBroken = (game as any).play?.spadesBroken || false;
  const completedTricks = (game as any).play?.completedTricks || [];
  const currentTrick = (game as any).play?.currentTrick || [];
  
  // CRITICAL: If currentTrick is empty, we're leading or between tricks
  // Check completedTricks to see if spades were broken in a previous trick
  // If no completed tricks exist (or undefined), we're at trick 1 and spades cannot be broken yet
  const isEmptyTrick = !Array.isArray(currentTrick) || currentTrick.length === 0;
  const hasCompletedTricks = Array.isArray(completedTricks) && completedTricks.length > 0;
  
  if (isEmptyTrick) {
    // Empty current trick - if no completed tricks, we're at trick 1 (spades not broken)
    // If completed tricks exist, check if any contain spades
    if (!hasCompletedTricks) {
      // No completed tricks = trick 1, spades cannot be broken yet
      delete spadesBrokenCache[gameId];
      return false;
    }
    // Have completed tricks - check if any contain spades
    for (const trick of completedTricks) {
      if (trick && trick.cards && Array.isArray(trick.cards) && trick.cards.some((card: any) => card && card.suit === 'SPADES')) {
        spadesBrokenCache[gameId] = true;
        return true;
      }
    }
    // Completed tricks exist but none have spades - spades not broken in this round yet
    delete spadesBrokenCache[gameId];
    return false;
  }
  
  // Current trick has cards - check if a spade is in it
  const hasSpadeInCurrentTrick = currentTrick.some((card: any) => card && card.suit === 'SPADES');
  if (hasSpadeInCurrentTrick) {
    spadesBrokenCache[gameId] = true;
    return true;
  }
  
  // No spade in current trick - check cache as fallback
  if (spadesBrokenCache[gameId]) {
    return true;
  }
  
  // Detect new round to safely clear cache (13 cards in a hand and no completed tricks yet)
  try {
    const hands: any[] | undefined = (game as any).hands || (game as any).playerHands;
    const firstHandCount = Array.isArray(hands) && Array.isArray(hands[0]) ? hands[0].length : undefined;
    const completedCount = (game as any).play?.completedTricks?.length || 0;
    if (firstHandCount === 13 && completedCount === 0) {
      // Fresh round; rely on server flag for this round until a spade is seen
      if (!spadesBroken) {
        delete spadesBrokenCache[gameId];
      }
    }
  } catch {}

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
  trickCompleted: boolean,
  currentTrickOverride?: Card[]
): Card[] => {
  if (!hand || hand.length === 0) return [];
  
  const specialRules = (gameState as any).specialRules || {};
  const rule1: 'NONE'|'SCREAMER'|'ASSASSIN'|'SECRET_ASSASSIN' = specialRules.specialRule1 || (specialRules.assassin ? 'ASSASSIN' : (specialRules.screamer ? 'SCREAMER' : 'NONE'));
  const rule2: 'NONE'|'LOWBALL'|'HIGHBALL' = specialRules.specialRule2 || 'NONE';
  const secretSeat = (gameState as any).play?.secretAssassinSeat ?? specialRules.secretAssassinSeat;

  // Try to detect my seat by matching hand against gameState.hands
  let mySeatIndex: number | null = null;
  try {
    const hands = (gameState as any).hands as Card[][] | undefined;
    if (hands && Array.isArray(hands)) {
      for (let i = 0; i < hands.length; i++) {
        const h = hands[i] || [];
        if (h.length === hand.length) {
          const key = (c: Card) => `${c.suit}-${c.rank}`;
          const a = new Set(hand.map(key));
          const b = new Set(h.map(key));
          if (a.size === b.size && [...a].every(k => b.has(k))) {
            mySeatIndex = i; break;
          }
        }
      }
    }
  } catch {}

  const isAssassinSeat = (rule1 === 'ASSASSIN') || (rule1 === 'SECRET_ASSASSIN' && (mySeatIndex === secretSeat));
  const isScreamerSeat = (rule1 === 'SCREAMER') || (rule1 === 'SECRET_ASSASSIN' && (mySeatIndex !== null) && (mySeatIndex !== secretSeat));
  
  // DEBUG: Log Secret Assassin detection
  console.log('[SECRET ASSASSIN DEBUG]', {
    rule1,
    mySeatIndex,
    secretSeat,
    isAssassinSeat,
    isScreamerSeat,
    specialRules: specialRules,
    playSecretSeat: (gameState as any).play?.secretAssassinSeat
  });
  const spadesBroken = hasSpadeBeenPlayed(gameState);
  
  // CRITICAL FIX: Use currentTrick override if provided, otherwise fall back to gameState
  const currentTrick = currentTrickOverride || gameState.play?.currentTrick;
  
  // If not leading, must follow suit
  if (!isLeading && currentTrick && currentTrick.length > 0) {
    const leadSuit = getLeadSuit(currentTrick);
    if (leadSuit) {
      // Check if player has cards in the lead suit
      const leadSuitCards = hand.filter(card => card.suit === leadSuit);
      
      // If player has cards in lead suit, must play one of them
      if (leadSuitCards.length > 0) {
        // LOW/HIGHBALL applies within the lead suit
        if (rule2 !== 'NONE') {
          const order: Record<string, number> = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
          const sorted = [...leadSuitCards].sort((a,b)=> order[a.rank]-order[b.rank]);
          return rule2 === 'LOWBALL' ? [sorted[0]] : [sorted[sorted.length-1]];
        }
        return leadSuitCards;
      }
      // If player is void in lead suit
      else {
        let playableCards = hand;
        
        // ASSASSIN: Must cut with spades when void in lead suit
        if (isAssassinSeat) {
          const spades = hand.filter(card => card.suit === 'SPADES');
          if (spades.length > 0) {
            playableCards = spades; // MUST play spades
          }
        }
        
        // SCREAMER: Cannot play spades unless only have spades
        if (isScreamerSeat) {
          const nonSpades = hand.filter(card => card.suit !== 'SPADES');
          if (nonSpades.length > 0) {
            playableCards = playableCards.filter(card => card.suit !== 'SPADES');
          }
        }

        // LOW/HIGHBALL: For each legal suit when void, find the lowest/highest card in that suit
        if (rule2 !== 'NONE' && playableCards.length > 0) {
          const order: Record<string, number> = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
          const suits = [...new Set(playableCards.map(card => card.suit))];
          const result = [];
          
          for (const suit of suits) {
            const suitCards = playableCards.filter(card => card.suit === suit);
            const sorted = [...suitCards].sort((a,b) => order[a.rank] - order[b.rank]);
            if (rule2 === 'LOWBALL') {
              result.push(sorted[0]); // Lowest card in this suit
            } else { // HIGHBALL
              result.push(sorted[sorted.length-1]); // Highest card in this suit
            }
          }
          return result;
        }

        return playableCards;
      }
    }
  }
  
  // If leading
  if (isLeading) {
    let playableCards = hand;
    
    // CORE: Cannot lead spades before broken unless only spades in hand
    if (!spadesBroken) {
      const nonSpades = hand.filter(card => card.suit !== 'SPADES');
      if (nonSpades.length > 0) {
        playableCards = playableCards.filter(card => card.suit !== 'SPADES');
      }
    }

    // ASSASSIN: Must lead spades if spades are broken and player has spades
    if (isAssassinSeat && spadesBroken) {
      const spades = hand.filter(card => card.suit === 'SPADES');
      if (spades.length > 0) {
        playableCards = spades; // MUST lead spades
      }
    }
    
    // SCREAMER: Cannot lead spades unless only have spades (spadesBroken doesn't override this)
    if (isScreamerSeat) {
      const nonSpades = hand.filter(card => card.suit !== 'SPADES');
      if (nonSpades.length > 0) {
        playableCards = playableCards.filter(card => card.suit !== 'SPADES');
      }
    }

    // LOW/HIGHBALL: For each legal suit, find the lowest/highest card in that suit
    if (rule2 !== 'NONE' && playableCards.length > 0) {
      const order: Record<string, number> = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
      const suits = [...new Set(playableCards.map(card => card.suit))];
      const result = [];
      
      for (const suit of suits) {
        const suitCards = playableCards.filter(card => card.suit === suit);
        const sorted = [...suitCards].sort((a,b) => order[a.rank] - order[b.rank]);
        if (rule2 === 'LOWBALL') {
          result.push(sorted[0]); // Lowest card in this suit
        } else { // HIGHBALL
          result.push(sorted[sorted.length-1]); // Highest card in this suit
        }
      }
      return result;
    }

    // CRITICAL FIX: After spades are broken, ALL players can lead spades (unless screamer rule applies)
    // Only restrict spades if they haven't been broken yet AND player has non-spades
    // Screamer rule already handled above, so we only need to check core rule here
    if (!spadesBroken) {
      const nonSpades = hand.filter(card => card.suit !== 'SPADES');
      if (nonSpades.length > 0) {
        playableCards = playableCards.filter(card => card.suit !== 'SPADES');
      }
    }
    // If spadesBroken is true, spades are playable (already in playableCards unless screamer rule filtered them)
    return playableCards;
  }
  
  // Fallback
  return hand;
};
