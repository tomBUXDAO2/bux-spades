export type GameType = 'REGULAR' | 'SOLO' | 'WHIZ' | 'MIRROR';
export type GameMode = 'PARTNERS' | 'SOLO';
export type BiddingOption = 'REG' | 'WHIZ' | 'MIRROR' | 'GIMMICK';
export type GamePlayOption = 'REG' | 'WHIZ' | 'MIRROR';

export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
  playedBy?: Player;
}

export interface Player {
  id: string;
  name: string;
  team: number;
  position: number;
  isDealer: boolean;
  image?: string;
  hand: Card[];
  bid?: number;
  tricks?: number;
  avatar?: string;
  username?: string;
}

export interface Bot {
  id: string;
  username: string;
  avatar: string;
  type: 'bot';
  position: number;
  hand: Card[];
  bid?: number;
  tricks?: number;
  isDealer?: boolean;
  team?: number;
}

export interface GameState {
  id: string;
  status: 'WAITING' | 'BIDDING' | 'PLAYING' | 'COMPLETED';
  players: (Player | Bot | null)[];
  currentPlayer: string;
  currentTrick: Card[];
  completedTricks: Card[][];
  scores: {
    team1: number;
    team2: number;
  };
  rules: {
    gameType: GameType;
    allowNil: boolean;
    allowBlindNil: boolean;
    numHands: number;
    coinAmount: number;
  };
  round: number;
  maxPoints: number;
  minPoints: number;
  winningTeam?: 'team1' | 'team2';
  cardPlayers?: Record<string, string>;
  team1Bags?: number;
  team2Bags?: number;
  gameMode?: string;
  forcedBid?: string;
  specialRules?: { screamer?: boolean; assassin?: boolean };
  buyIn?: number;
  creatorId: string;
}

export interface HandSummary {
  team1Score: number;
  team2Score: number;
  totalScores: {
    team1: number;
    team2: number;
  };
}

export interface TeamScore {
  team: 1 | 2;
  score: number;
  bid: number;
  tricks: number;
  nilBids: number;
  madeNils: number;
}

export interface CompletedTrick {
  cards: Card[];
  winnerIndex: number;
  winningCard: Card;
}

export interface GameRules {
  gameType: GameType;
  allowNil: boolean;
  allowBlindNil: boolean;
  minPoints: number;
  maxPoints: number;
  coinAmount: number;
  numHands?: number;
}

export interface GameSettings {
  gameMode: GameMode;
  biddingOption: BiddingOption;
  gamePlayOption: GamePlayOption;
  minPoints: number;
  maxPoints: number;
  buyIn: number;
  specialRules: {
    screamer: boolean;
    assassin: boolean;
    allowNil: boolean;
    allowBlindNil: boolean;
  };
} 