import { TeamScore as ScoringTeamScore } from '@/lib/scoring';

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  suit: Suit;
  rank: Rank;
  playedBy?: {
    id: string;
    name: string;
    position: number;
  };
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  tricks: number;
  team: 1 | 2;
  bid?: number;
  browserSessionId?: string;
  isDealer?: boolean;
  position: number;
  image?: string;
}

export type GameStatus = "WAITING" | "BIDDING" | "PLAYING" | "FINISHED";

export type GameType = 'REGULAR' | 'WHIZ' | 'SOLO' | 'MIRROR';

export interface GameRules {
  gameType: GameType;
  allowNil: boolean;
  allowBlindNil: boolean;
  minPoints: number;
  maxPoints: number;
  numHands?: number;
  coinAmount: number;  // Amount of coins each player must put in
}

export interface TeamScore extends Omit<ScoringTeamScore, 'team'> {
  team: 1 | 2;
}

export interface GameState {
  id: string;
  status: GameStatus;
  players: Player[];
  currentPlayer: string;
  currentTrick: Card[];
  tricks: Array<{
    winningPlayerId: string;
    cards: Card[];
  }>;
  completedTricks: Array<{
    winner: string;
    cards: Card[];
  }>;
  hands: { [key: string]: Card[] };
  scores: { [key: string]: number };
  bids: { [key: string]: number };
  dealerPosition: number;
  northSouthTricks: number;
  eastWestTricks: number;
  team1Bags: number;
  team2Bags: number;
  winningTeam?: string;
  currentTrickCardPlayers: { playerId: string; card: Card }[];
  cardPlayers: { [key: string]: string }; // Maps card IDs to player IDs
  createdAt: string;
  rules: GameRules;
  minPoints: number;
  maxPoints: number;
  round?: number;
}

export interface LobbyState {
  games: GameState[];
}

export type GameAction = 
  | { type: "CREATE_GAME"; userId: string }
  | { type: "JOIN_GAME"; gameId: string; userId: string }
  | { type: "MAKE_BID"; gameId: string; userId: string; bid: number }
  | { type: "PLAY_CARD"; gameId: string; userId: string; card: Card };

export interface CompletedTrick {
  cards: Card[];
  winningCard: Card;
  winningPlayerId: string;
}

export interface HandSummary {
  team1Score: TeamScore;
  team2Score: TeamScore;
  totalScores: {
    team1: number;
    team2: number;
  };
}

export interface PlayAgainEventData {
  playerId: string;
} 