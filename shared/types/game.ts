export interface GameRules {
  gameType: string;
  allowNil: boolean;
  allowBlindNil: boolean;
  coinAmount?: number;
  maxPoints: number;
  minPoints: number;
}

export interface GamePlayer {
  id: string;
  username: string;
  avatar: string;
}

export interface Game {
  id: string;
  gameMode: 'REG' | 'WHIZ' | 'MIRRORS' | 'GIMMICK';
  maxPoints: number;
  minPoints: number;
  buyIn: number;
  forcedBid?: 'SUICIDE' | 'NONE';
  specialRules: {
    screamer: boolean;
    assassin: boolean;
  };
  players: (GamePlayer | null)[];
  status: 'waiting' | 'in-progress' | 'completed';
  rules: GameRules;
}

export interface GameSettings {
  gameMode: 'regular' | 'whiz' | 'mirrors' | 'gimmick';
  playMode: 'partners' | 'solo';
  minPoints: number;
  maxPoints: number;
  buyIn: number;
  specialRules: {
    screamer: boolean;
    assassin: boolean;
  };
  rules: GameRules;
} 