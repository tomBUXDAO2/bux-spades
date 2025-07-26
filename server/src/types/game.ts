export type GameMode = 'PARTNERS' | 'SOLO';
export type BiddingOption = 'REG' | 'WHIZ' | 'MIRROR' | 'SUICIDE' | '4 OR NIL' | 'BID 3' | 'BID HEARTS';
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
  id: string; // Ensure id is always a string and never null
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
  forcedBid: 'SUICIDE' | 'BID4NIL' | 'BID3' | 'BIDHEARTS' | 'NONE';
  specialRules: {
    screamer?: boolean;
    assassin?: boolean;
  };
  players: (GamePlayer | null)[];
  spectators: GamePlayer[];
  status: 'WAITING' | 'BIDDING' | 'PLAYING' | 'HAND_COMPLETED' | 'COMPLETED';
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
    spadesBroken?: boolean;
  };
  team1TotalScore?: number;
  team2TotalScore?: number;
  team1Bags?: number;
  team2Bags?: number;
  // Solo mode properties
  playerScores?: number[];
  playerBags?: number[];
  winningPlayer?: number;
  winningTeam?: 'team1' | 'team2';
  currentPlayer?: string;
} 