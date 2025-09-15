export interface TrickLogData {
  roundId: string;
  trickNumber: number;
  leadPlayerId: string;
  winningPlayerId: string;
  cards: {
    playerId: string;
    suit: string;
    value: number;
    position: number;
  }[];
}

export interface RoundLogData {
  gameId: string;
  roundNumber: number;
}

export interface TrickStats {
  totalRounds: number;
  totalTricks: number;
  totalCards: number;
}
