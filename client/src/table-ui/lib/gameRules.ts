import { GameType, Card, Suit, Player, GameState } from '@/types/game';

/**
 * Determines if a player can bid nil based on the game type and their hand
 */
export function canBidNil(gameType: GameType, numSpades: number): boolean {
  switch (gameType) {
    case 'REGULAR':
    case 'SOLO':
      return true; // Regular and Solo games allow nil bids
    case 'WHIZ':
      return numSpades === 0; // Only allow nil bid if no spades
    case 'MIRROR':
      return false; // Mirror games don't allow nil bids
    default:
      return false;
  }
}

/**
 * Returns the valid bid range for a player based on game type and hand
 */
export function getValidBidRange(gameType: GameType, numSpades: number): { min: number; max: number } {
  switch (gameType) {
    case 'REGULAR':
    case 'SOLO':
      return { min: 0, max: 13 }; // Full range including nil
    case 'WHIZ':
      return { min: numSpades, max: numSpades }; // Must bid number of spades
    case 'MIRROR':
      return { min: numSpades, max: numSpades }; // Must bid number of spades
    default:
      return { min: 0, max: 13 };
  }
}

/**
 * Validates if a bid is legal for the given game type and player's hand
 */
export function isValidBid(gameType: GameType, bid: number, numSpades: number): boolean {
  const { min, max } = getValidBidRange(gameType, numSpades);
  
  switch (gameType) {
    case 'REGULAR':
    case 'SOLO':
      return bid >= 0 && bid <= 13;
    case 'WHIZ':
      return bid === numSpades || (bid === 0 && numSpades === 0);
    case 'MIRROR':
      return bid === numSpades;
    default:
      return false;
  }
}

/**
 * Calculates the score for a team based on their performance in the hand
 */
export function calculateGameTypeScore(
  gameType: GameType,
  bid: number,
  tricks: number,
  isNilBid: boolean = false,
  madeNil: boolean = false
): number {
  switch (gameType) {
    case 'REGULAR':
    case 'SOLO':
      if (isNilBid) {
        return madeNil ? 100 : -100;
      }
      if (tricks >= bid) {
        return (bid * 10) + (tricks - bid); // Base points + bags
      }
      return -(bid * 10); // Failed contract

    case 'WHIZ':
      if (bid === 0 && tricks === 0) {
        return 100; // Made nil
      }
      if (bid === 0 && tricks > 0) {
        return -100; // Failed nil
      }
      if (tricks === bid) {
        return bid * 20; // Double points for exact bid
      }
      return -(bid * 10); // Failed contract

    case 'MIRROR':
      if (tricks === bid) {
        return bid * 15; // 1.5x points for making exact bid
      }
      return -(bid * 10); // Failed contract

    default:
      return 0;
  }
}

/**
 * Determines if a card can be played based on the game type and current state
 */
export function isPlayableCard(
  gameType: GameType,
  card: Card,
  hand: Card[],
  leadSuit: Suit | null,
  isLeadingTrick: boolean
): boolean {
  // If leading the trick, any card is playable
  if (isLeadingTrick) {
    return true;
  }

  // Must follow suit if possible
  if (leadSuit) {
    const hasSuit = hand.some(c => c.suit === leadSuit);
    if (hasSuit) {
      return card.suit === leadSuit;
    }
  }

  // If can't follow suit, any card is playable
  return true;
}

/**
 * Determines if a hand is complete based on game type
 */
export function isHandComplete(game: GameState): boolean {
  // A hand is complete when all players have played all their cards
  return game.players.every(player => player.hand.length === 0);
}

/**
 * Determines if the game is over based on game type and scores
 */
export function isGameOver(game: GameState): boolean {
  const { team1Score = 0, team2Score = 0 } = game.scores || {};
  
  switch (game.rules.gameType) {
    case 'REGULAR':
    case 'SOLO':
      return team1Score >= 500 || team2Score >= 500 || team1Score <= -250 || team2Score <= -250;
    
    case 'WHIZ':
    case 'MIRROR':
      // Game ends after specified number of hands or when a team reaches the winning score
      return (game.round || 0) >= (game.rules.numHands || 4) || 
             team1Score >= 500 || team2Score >= 500;
    
    default:
      return false;
  }
}

/**
 * Gets the winning team if the game is over
 */
export function getWinningTeam(game: GameState): 'team1' | 'team2' | null {
  if (!isGameOver(game)) {
    return null;
  }

  const { team1Score = 0, team2Score = 0 } = game.scores || {};
  
  // If a team has gone below the minimum score, the other team wins
  if (team1Score <= -250) return 'team2';
  if (team2Score <= -250) return 'team1';
  
  // Otherwise, highest score wins
  return team1Score > team2Score ? 'team1' : 'team2';
} 