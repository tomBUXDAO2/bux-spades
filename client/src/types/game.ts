export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export type GameMode = 'PARTNERS' | 'SOLO';
export type BiddingOption = 'REG' | 'WHIZ' | 'MIRROR' | 'SUICIDE';
export type GamePlayOption = 'REG' | 'SCREAMER' | 'ASSASSIN';

export interface GameSettings {
  mode: GameMode;
  biddingOption: BiddingOption;
  gamePlayOption: GamePlayOption;
}

export type GameStatus = 'WAITING' | 'BIDDING' | 'PLAYING' | 'FINISHED';

export interface Card {
  suit: Suit;
  rank: Rank;
  value: number;
}

export interface Player {
  id: string;
  username: string;
  team: number;
  hand: Card[];
  bid?: number;
  tricks?: number;
}

export interface GameState {
  id: string;
  settings: GameSettings;
  status: GameStatus;
  players: Player[];
  currentPlayerTurn: string;
  currentTrick: Card[];
  team1Score: number;
  team2Score: number;
  team1Bags: number;
  team2Bags: number;
  team1Bid: number;
  team2Bid: number;
  team1Tricks: number;
  team2Tricks: number;
  handNumber: number;
  dealer: string;
  lastWinningCard?: Card;
  lastWinningPlayer?: string;
}

export interface HandSummary {
  team1Bid: number;
  team2Bid: number;
  team1Tricks: number;
  team2Tricks: number;
  team1Bags: number;
  team2Bags: number;
  team1Score: number;
  team2Score: number;
  handNumber: number;
}

export interface GameRules {
  mode: GameMode;
  biddingOption: BiddingOption;
  gamePlayOption: GamePlayOption;
  allowNil: boolean;
  allowBlindNil: boolean;
  allowDoubleNil: boolean;
  allowDoubleBlindNil: boolean;
  allowDoubleBlindDoubleNil: boolean;
  allowDoubleBlindDoubleBlindNil: boolean;
} 