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
  if (team1Score >= maxPoints) return { isOver: true, winner: 1 };
  if (team2Score >= maxPoints) return { isOver: true, winner: 2 };
  if (team1Score <= minPoints) return { isOver: true, winner: 2 };
  if (team2Score <= minPoints) return { isOver: true, winner: 1 };
  return { isOver: false, winner: null };
}; 