/**
 * Convert card rank to numeric value
 */
export function getCardValue(rank: string): number {
  const values: { [key: string]: number } = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return values[rank] || 0;
}

/**
 * Convert suit abbreviation to full suit name
 */
export function getFullSuitName(suit: string): string {
  const suitMap: { [key: string]: string } = {
    'S': 'SPADES',
    'H': 'HEARTS', 
    'D': 'DIAMONDS',
    'C': 'CLUBS'
  };
  return suitMap[suit] || suit;
}
