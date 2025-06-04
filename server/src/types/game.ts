export type GameMode = 'PARTNERS' | 'SOLO';
export type BiddingOption = 'REG' | 'WHIZ' | 'MIRROR' | 'GIMMICK';
export type GamePlayOption = 'REG' | 'WHIZ' | 'MIRROR';

export interface GamePlayer {
  id: string;
  username: string;
  avatar: string | null;
  type: 'human' | 'bot';
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
  completedTricks: any[];
  rules: {
    gameType: GameMode;
    allowNil: boolean;
    allowBlindNil: boolean;
    coinAmount: number;
    maxPoints: number;
    minPoints: number;
  };
  isBotGame: boolean;
} 