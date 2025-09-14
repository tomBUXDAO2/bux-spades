import type { Game, Card, Suit, Rank } from '../../types/game';

/**
 * Game rule constants and validation
 */
export const GAME_RULES = {
  MIN_POINTS: -1000,
  MAX_POINTS: 10000,
  MIN_BUY_IN: 0,
  MAX_BUY_IN: 100000000,
  CARDS_PER_HAND: 13,
  PLAYERS_PER_GAME: 4,
  TRICKS_PER_HAND: 13
} as const;

/**
 * Card values for comparison
 */
export const CARD_VALUES: { [key in Rank]: number } = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

/**
 * Suit hierarchy (Spades are always trump)
 */
export const SUIT_HIERARCHY: { [key in Suit]: number } = {
  'SPADES': 4,    // Trump
  'HEARTS': 3,
  'DIAMONDS': 2,
  'CLUBS': 1
};

/**
 * Validates game settings
 */
export function validateGameSettings(settings: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!settings.gameMode || !['SOLO', 'PARTNERS'].includes(settings.gameMode)) {
    errors.push('Invalid game mode');
  }
  
  if (typeof settings.maxPoints !== 'number' || settings.maxPoints < GAME_RULES.MIN_POINTS || settings.maxPoints > GAME_RULES.MAX_POINTS) {
    errors.push('Invalid max points');
  }
  
  if (typeof settings.minPoints !== 'number' || settings.minPoints < GAME_RULES.MIN_POINTS || settings.minPoints > GAME_RULES.MAX_POINTS) {
    errors.push('Invalid min points');
  }
  
  if (typeof settings.buyIn !== 'number' || settings.buyIn < GAME_RULES.MIN_BUY_IN || settings.buyIn > GAME_RULES.MAX_BUY_IN) {
    errors.push('Invalid buy-in amount');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Determines if a card can be played based on game rules
 */
export function canPlayCard(card: Card, hand: Card[], currentTrick: Card[], game: Game): boolean {
  // If no cards in trick, any card can be played
  if (currentTrick.length === 0) {
    return true;
  }
  
  const leadSuit = currentTrick[0].suit;
  
  // Must follow suit if possible
  const hasLeadSuit = hand.some(c => c.suit === leadSuit);
  if (hasLeadSuit && card.suit !== leadSuit) {
    return false;
  }
  
  // Special rules
  if (game.rules?.screamer) {
    return canPlayCardScreamer(card, hand, currentTrick, game);
  }
  
  if (game.rules?.assassin) {
    return canPlayCardAssassin(card, hand, currentTrick, game);
  }
  
  return true;
}

/**
 * Screamer rule: Cannot play spades unless following spade lead or no other suits available
 */
function canPlayCardScreamer(card: Card, hand: Card[], currentTrick: Card[], game: Game): boolean {
  if (card.suit !== 'SPADES') {
    return true;
  }
  
  const leadSuit = currentTrick[0].suit;
  
  // Can play spades if following spade lead
  if (leadSuit === 'SPADES') {
    return true;
  }
  
  // Can play spades if no other suits available
  const nonSpadeCards = hand.filter(c => c.suit !== 'SPADES');
  if (nonSpadeCards.length === 0) {
    return true;
  }
  
  return false;
}

/**
 * Assassin rule: Must cut and lead spades when possible
 */
function canPlayCardAssassin(card: Card, hand: Card[], currentTrick: Card[], game: Game): boolean {
  const leadSuit = currentTrick[0].suit;
  
  // If leading and have spades, must lead spades
  if (currentTrick.length === 0 && card.suit !== 'SPADES') {
    const hasSpades = hand.some(c => c.suit === 'SPADES');
    if (hasSpades) {
      return false;
    }
  }
  
  // If can't follow suit and have spades, must cut with spades
  if (leadSuit !== 'SPADES' && card.suit !== 'SPADES') {
    const hasLeadSuit = hand.some(c => c.suit === leadSuit);
    const hasSpades = hand.some(c => c.suit === 'SPADES');
    if (!hasLeadSuit && hasSpades) {
      return false;
    }
  }
  
  return true;
}

/**
 * Determines the winner of a trick
 */
export function determineTrickWinner(trick: Card[], leadSuit: Suit): { winner: number; winningCard: Card } {
  if (trick.length !== 4) {
    throw new Error('Invalid trick length');
  }
  
  let winningCard = trick[0];
  let winnerIndex = 0;
  
  for (let i = 1; i < trick.length; i++) {
    const card = trick[i];
    
    // Spades always beat non-spades
    if (card.suit === 'SPADES' && winningCard.suit !== 'SPADES') {
      winningCard = card;
      winnerIndex = i;
    } else if (card.suit === 'SPADES' && winningCard.suit === 'SPADES') {
      // Both spades, compare values
      if (CARD_VALUES[card.rank] > CARD_VALUES[winningCard.rank]) {
        winningCard = card;
        winnerIndex = i;
      }
    } else if (card.suit === winningCard.suit) {
      // Same suit, compare values
      if (CARD_VALUES[card.rank] > CARD_VALUES[winningCard.rank]) {
        winningCard = card;
        winnerIndex = i;
      }
    }
    // If different non-spade suits, lead suit wins
  }
  
  return { winner: winnerIndex, winningCard };
}

/**
 * Calculates hand score for solo games
 */
export function calculateSoloHandScore(tricks: number, bid: number): number {
  if (tricks === bid) {
    return bid * 10; // Made bid exactly
  } else if (tricks > bid) {
    return (bid * 10) + (tricks - bid); // Made bid + bags
  } else {
    return -(bid * 10); // Failed bid
  }
}

/**
 * Calculates team score for partners games
 */
export function calculateTeamScore(team1Tricks: number, team1Bid: number, team2Tricks: number, team2Bid: number): {
  team1Score: number;
  team2Score: number;
  team1Bags: number;
  team2Bags: number;
} {
  const team1Score = calculateSoloHandScore(team1Tricks, team1Bid);
  const team2Score = calculateSoloHandScore(team2Tricks, team2Bid);
  
  const team1Bags = Math.max(0, team1Tricks - team1Bid);
  const team2Bags = Math.max(0, team2Tricks - team2Bid);
  
  return {
    team1Score,
    team2Score,
    team1Bags,
    team2Bags
  };
}

/**
 * Checks if game is complete
 */
export function isGameComplete(game: Game): boolean {
  if (game.gameMode === 'SOLO') {
    return game.team1TotalScore >= game.maxPoints || game.team1TotalScore <= game.minPoints;
  } else {
    return game.team1TotalScore >= game.maxPoints || game.team2TotalScore >= game.maxPoints ||
           game.team1TotalScore <= game.minPoints || game.team2TotalScore <= game.minPoints;
  }
}

/**
 * Gets the winning team
 */
export function getWinningTeam(game: Game): number | null {
  if (!isGameComplete(game)) {
    return null;
  }
  
  if (game.gameMode === 'SOLO') {
    return game.team1TotalScore >= game.maxPoints ? 1 : 0;
  } else {
    if (game.team1TotalScore >= game.maxPoints) return 1;
    if (game.team2TotalScore >= game.maxPoints) return 2;
    if (game.team1TotalScore <= game.minPoints) return 2;
    if (game.team2TotalScore <= game.minPoints) return 1;
  }
  
  return null;
}
