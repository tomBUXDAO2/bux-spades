import type { Player } from '@/types/game';

export interface TeamScore {
  bid: number;
  tricks: number;
  nilBids: number;
  madeNils: number;
  score: number;
  bags: number;
  team?: 1 | 2;  // Optional to maintain compatibility
}

export function calculateHandScore(players: Player[]): { team1: TeamScore; team2: TeamScore } {
  const team1Players = players.filter(p => p.team === 1);
  const team2Players = players.filter(p => p.team === 2);

  const team1 = {
    bid: team1Players.reduce((sum, p) => sum + (p.bid || 0), 0),
    tricks: team1Players.reduce((sum, p) => sum + (p.tricks || 0), 0),
    nilBids: team1Players.filter(p => p.bid === 0).length,
    madeNils: team1Players.filter(p => p.bid === 0 && p.tricks === 0).length,
    score: 0,
    bags: 0,
    team: 1 as const
  };

  const team2 = {
    bid: team2Players.reduce((sum, p) => sum + (p.bid || 0), 0),
    tricks: team2Players.reduce((sum, p) => sum + (p.tricks || 0), 0),
    nilBids: team2Players.filter(p => p.bid === 0).length,
    madeNils: team2Players.filter(p => p.bid === 0 && p.tricks === 0).length,
    score: 0,
    bags: 0,
    team: 2 as const
  };

  // Validate total tricks equals 13
  const totalTricks = team1.tricks + team2.tricks;
  if (totalTricks > 0 && totalTricks !== 13) {
    console.error(`Invalid trick count: ${totalTricks}. Expected 13 tricks total.`);
    // Adjust tricks if needed
    if (team1.tricks + team2.tricks < 13) {
      // Add missing tricks to the team with more tricks
      const missingTricks = 13 - totalTricks;
      if (team1.tricks > team2.tricks) {
        team1.tricks += missingTricks;
      } else {
        team2.tricks += missingTricks;
      }
    }
  }

  // Handle nil bids first
  team1.score += team1.madeNils * 100;
  team1.score -= (team1.nilBids - team1.madeNils) * 100;
  
  team2.score += team2.madeNils * 100;
  team2.score -= (team2.nilBids - team2.madeNils) * 100;

  // Calculate non-nil bids
  const team1NonNilBid = team1.bid - (team1.nilBids * 0); // Nil bids don't count towards team bid
  const team2NonNilBid = team2.bid - (team2.nilBids * 0); // Nil bids don't count towards team bid

  // Score regular bids - team must make their combined bid
  if (team1.tricks >= team1NonNilBid) {
    team1.score += team1NonNilBid * 10;  // Points for making bid
    if (team1.tricks > team1NonNilBid) {
      // Only overbooks (tricks above bid) count as bags
      team1.bags = team1.tricks - team1NonNilBid;
      team1.score += team1.bags;  // Each bag worth 1 point
    }
  } else {
    team1.score -= team1NonNilBid * 10;  // Penalty for not making bid
  }

  if (team2.tricks >= team2NonNilBid) {
    team2.score += team2NonNilBid * 10;  // Points for making bid
    if (team2.tricks > team2NonNilBid) {
      // Only overbooks (tricks above bid) count as bags
      team2.bags = team2.tricks - team2NonNilBid;
      team2.score += team2.bags;  // Each bag worth 1 point
    }
  } else {
    team2.score -= team2NonNilBid * 10;  // Penalty for not making bid
  }

  return { team1, team2 };
}

export function isGameOver(team1Score: number, team2Score: number, minPoints: number, maxPoints: number): { isOver: boolean; winner: 1 | 2 | null } {
  // If both teams are below minPoints, highest score wins
  if (team1Score <= minPoints && team2Score <= minPoints) {
    return {
      isOver: true,
      winner: team1Score > team2Score ? 1 : 2
    };
  }

  // If both teams are above maxPoints, highest score wins
  if (team1Score >= maxPoints && team2Score >= maxPoints) {
    return {
      isOver: true,
      winner: team1Score > team2Score ? 1 : 2
    };
  }

  // If either team is below minPoints, they lose immediately
  if (team1Score <= minPoints) {
    return {
      isOver: true,
      winner: 2
    };
  }
  if (team2Score <= minPoints) {
    return {
      isOver: true,
      winner: 1
    };
  }

  // If either team is above maxPoints, they win
  if (team1Score >= maxPoints) {
    return {
      isOver: true,
      winner: 1
    };
  }
  if (team2Score >= maxPoints) {
    return {
      isOver: true,
      winner: 2
    };
  }

  // Game continues if no winning condition is met (including tied scores)
  return {
    isOver: false,
    winner: null
  };
} 