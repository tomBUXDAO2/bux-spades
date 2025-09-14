// Game Logic Modules
export * from './dealing';
export * from './bot-play';
export * from './game-rules';
export * from './socket-handlers';
export * from './timeout-management';
export * from './hand-completion';
export * from './game-formats';

// Re-export commonly used functions for convenience
export { 
  dealCards, 
  assignDealer, 
  dealNewHand 
} from './dealing';

export { 
  botMakeMove, 
  botPlayCard 
} from './bot-play';

export { 
  validateGameSettings, 
  canPlayCard, 
  determineTrickWinner, 
  calculateSoloHandScore,
  isGameComplete,
  getWinningTeam
} from './game-rules';

export { 
  handleJoinGame, 
  handleMakeBid, 
  handlePlayCard 
} from './socket-handlers';

export { 
  startTurnTimeout, 
  clearTurnTimeout, 
  clearAllTimeoutsForGame 
} from './timeout-management';

export {
  handleHandCompletion,
  calculateHandStats
} from './hand-completion';

export {
  createGameFormatConfig,
  validateBid,
  getGameFormatDescription,
  applyGameFormatRules
} from './game-formats';
