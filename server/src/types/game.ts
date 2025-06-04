export type GameMode = 'PARTNERS' | 'SOLO';
export type BiddingOption = 'REG' | 'WHIZ' | 'MIRROR' | 'GIMMICK';
export type GamePlayOption = 'REG' | 'WHIZ' | 'MIRROR';
export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
  playedBy?: string;
  playerIndex?: number;
}

export interface GamePlayer {
  id: string;
  username: string;
  avatar: string | null;
  type: 'human' | 'bot';
  position?: number;
  hand?: Card[];
  bid?: number;
  tricks?: number;
  team?: number;
  isDealer?: boolean;
}

export interface Game {
  id: string;
  gameMode: GameMode;
  maxPoints: number;
  minPoints: number;
  buyIn: number;
  forcedBid: 'SUICIDE' | 'NONE';
  specialRules: {
    screamer?: boolean;
    assassin?: boolean;
  };
  players: (GamePlayer | null)[];
  status: 'WAITING' | 'BIDDING' | 'PLAYING' | 'COMPLETED';
  completedTricks: Card[][];
  rules: {
    gameType: GameMode;
    allowNil: boolean;
    allowBlindNil: boolean;
    coinAmount: number;
    maxPoints: number;
    minPoints: number;
    bidType: BiddingOption;
    gimmickType: GamePlayOption;
  };
  isBotGame: boolean;
  dealerIndex?: number;
  hands?: Card[][];
  bidding?: {
    currentPlayer: string;
    currentBidderIndex: number;
    bids: (number | null)[];
    nilBids: Record<string, boolean>;
  };
  play?: {
    currentPlayer: string;
    currentPlayerIndex: number;
    currentTrick: Card[];
    leadSuit?: Suit;
    tricks: {
      cards: Card[];
      winnerIndex: number;
    }[];
    trickNumber: number;
  };
  team1TotalScore?: number;
  team2TotalScore?: number;
  team1Bags?: number;
  team2Bags?: number;
  winningTeam?: 'team1' | 'team2';
} 