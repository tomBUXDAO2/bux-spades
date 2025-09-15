/**
 * Helper function to get card value for comparison
 */
export function getCardValue(card: any): number {
  const values: { [key: string]: number } = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return values[card.rank] || 0;
}

/**
 * Helper function to determine trick winner
 */
export function determineTrickWinner(trick: any[]): number {
  if (!trick || trick.length !== 4) return 0;
  
  const leadSuit = trick[0]?.suit;
  let winningCard = trick[0];
  let winnerIndex = 0;
  
  for (let i = 1; i < trick.length; i++) {
    const card = trick[i];
    if (!card) continue;
    
    // Spades always win
    if (card.suit === 'SPADES' && winningCard.suit !== 'SPADES') {
      winningCard = card;
      winnerIndex = i;
    }
    // If both are spades, higher rank wins
    else if (card.suit === 'SPADES' && winningCard.suit === 'SPADES') {
      if (getCardValue(card) > getCardValue(winningCard)) {
        winningCard = card;
        winnerIndex = i;
      }
    }
    // If neither is spades, follow suit and higher rank wins
    else if (card.suit === leadSuit && winningCard.suit === leadSuit) {
      if (getCardValue(card) > getCardValue(winningCard)) {
        winningCard = card;
        winnerIndex = i;
      }
    }
  }
  
  return winnerIndex;
}
