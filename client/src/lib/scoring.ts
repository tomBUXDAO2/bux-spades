import { Player } from '../types/game';

export const calculateHandScore = (players: Player[]) => {
  const team1Score = { score: 0, bid: 0, tricks: 0, nilBids: 0, madeNils: 0 };
  const team2Score = { score: 0, bid: 0, tricks: 0, nilBids: 0, madeNils: 0 };

  players.forEach(player => {
    const score = player.team === 1 ? team1Score : team2Score;
    score.bid += player.bid || 0;
    score.tricks += player.tricks || 0;
    if (player.bid === 0) {
      score.nilBids++;
      if (player.tricks === 0) {
        score.madeNils++;
      }
    }
  });

  // Calculate scores
  [team1Score, team2Score].forEach(score => {
    if (score.tricks >= score.bid) {
      score.score = score.bid * 10 + (score.tricks - score.bid);
    } else {
      score.score = -score.bid * 10;
    }
    score.score += score.madeNils * 100;
  });

  return { team1Score, team2Score };
};

export const isGameOver = (team1Score: number, team2Score: number, minPoints: number, maxPoints: number) => {
  // If either team is below minPoints, they lose immediately
  if (team1Score <= minPoints) return { isOver: true, winner: 2 };
  if (team2Score <= minPoints) return { isOver: true, winner: 1 };
  
  // If either team is above maxPoints, check if they have a clear lead
  if (team1Score >= maxPoints) {
    if (team1Score > team2Score) return { isOver: true, winner: 1 };
    // If tied at maxPoints, continue the game
  }
  if (team2Score >= maxPoints) {
    if (team2Score > team1Score) return { isOver: true, winner: 2 };
    // If tied at maxPoints, continue the game
  }
  
  // Game continues if no winning condition is met (including tied scores)
  return { isOver: false, winner: null };
}; 