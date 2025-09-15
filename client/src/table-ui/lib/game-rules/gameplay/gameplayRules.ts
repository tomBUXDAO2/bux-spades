import type { Card, Suit, GameState } from '../../../../types/game';

/**
 * Determines if a card can be played based on the game type and current state
 */
export function isPlayableCard(
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
  return game.players.every(player => player && player.hand.length === 0);
}

/**
 * Determines if the game is over based on game type and scores
 */
export function isGameOver(game: GameState): boolean {
  // Use the actual game settings - these should always be set when game is created
  const maxPoints = game.maxPoints;
  const minPoints = game.minPoints;
  
  // Validate that we have the required game settings
  if (maxPoints === undefined || minPoints === undefined) {
    console.error('[GAME OVER CHECK] Missing game settings - maxPoints:', maxPoints, 'minPoints:', minPoints);
    return false;
  }
  
  // Check if it's Solo mode
  if (game.gameMode === 'SOLO') {
    const playerScores = game.playerScores || [];
    console.log('[GAME OVER CHECK] Solo mode - Player scores:', playerScores, 'Max points:', maxPoints, 'Min points:', minPoints);
  
    // Check if any player has reached max points or gone below min points
    const isOver = playerScores.some(score => score >= maxPoints || score <= minPoints);
    console.log('[GAME OVER CHECK] Solo mode game over result:', isOver);
    return isOver;
  }

  // Partners mode (existing logic)
  const team1Score = game.team1TotalScore || 0;
  const team2Score = game.team2TotalScore || 0;
  
  console.log('[GAME OVER CHECK] Partners mode - Team 1 score:', team1Score, 'Team 2 score:', team2Score, 'Max points:', maxPoints, 'Min points:', minPoints);
  
  const isOver = team1Score >= maxPoints || team2Score >= maxPoints || team1Score <= minPoints || team2Score <= minPoints;
  console.log('[GAME OVER CHECK] Partners mode game over result:', isOver, 'Reason:', {
    team1AboveMax: team1Score >= maxPoints,
    team2AboveMax: team2Score >= maxPoints,
    team1BelowMin: team1Score <= minPoints,
    team2BelowMin: team2Score <= minPoints
  });
  
  return isOver;
}
