export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface Player {
  id: string;
  username: string;
  avatar: string | null;
  position?: number; // optional for now, as not always set
  cards?: Card[]; // optional for now, as not always set
}

export interface TeamScore {
  teamId: number;
  score: number;
}

export interface SpecialRules {
  screamer?: boolean;
  [key: string]: any;
}

export interface GameSettings {
  creatorId: string;
  creatorName: string;
  creatorImage?: string | null;
  gameMode: 'regular' | 'whiz' | 'mirrors' | 'gimmick';
  maxPoints: number;
  minPoints: number;
  buyIn: number;
  specialRules: SpecialRules;
}

export interface GameRules {
  gameType: string;
  allowNil: boolean;
  allowBlindNil: boolean;
  coinAmount: number;
  maxPoints: number;
  minPoints: number;
}

export type ForcedBid = 'SUICIDE' | 'NONE';

export interface Game {
  id: string;
  gameMode: 'REG' | 'WHIZ' | 'MIRRORS' | 'GIMMICK';
  maxPoints: number;
  minPoints: number;
  buyIn: number;
  forcedBid: ForcedBid;
  specialRules: SpecialRules;
  players: (Player | null)[];
  status: 'waiting' | 'active' | 'finished';
  completedTricks: any[];
  rules: GameRules;
  currentPlayer?: string;
  currentTrick?: Card[];
  teamScores?: TeamScore[];
}

export interface GameState {
  players: Player[];
  currentPlayer?: string;
  currentTrick?: Card[];
  teamScores?: TeamScore[];
} 