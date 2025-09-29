// Clean game state model
export class Game {
  constructor(data = {}) {
    this.id = data.id;
    this.status = data.status || 'WAITING';
    this.mode = data.mode || 'PARTNERS';
    this.maxPoints = data.maxPoints || 200;
    this.minPoints = data.minPoints || -100;
    this.buyIn = data.buyIn || 0;
    this.players = data.players || [];
    this.currentPlayer = data.currentPlayer || null;
    this.currentRound = data.currentRound || 1;
    this.currentTrick = data.currentTrick || 0;
    this.dealer = data.dealer || 0;
    this.createdAt = data.createdAt || new Date();
    this.startedAt = data.startedAt || null;
    this.finishedAt = data.finishedAt || null;
    
    // Game state
    this.hands = data.hands || [];
    this.bidding = data.bidding || {
      currentPlayer: null,
      currentBidderIndex: 0,
      bids: [null, null, null, null],
      nilBids: {}
    };
    this.play = data.play || {
      currentPlayer: null,
      currentPlayerIndex: 0,
      currentTrick: [],
      tricks: [],
      trickNumber: 0,
      spadesBroken: false
    };
    
    // Rules
    this.rules = data.rules || {
      gameType: 'PARTNERS',
      allowNil: true,
      allowBlindNil: false,
      coinAmount: 0,
      maxPoints: 200,
      minPoints: -100,
      bidType: 'REGULAR',
      specialRules: {
        screamer: false,
        assassin: false
      }
    };
  }

  // Get current player index
  getCurrentPlayerIndex() {
    if (typeof this.currentPlayer === 'string') {
      return this.players.findIndex(p => p && p.id === this.currentPlayer);
    }
    return this.currentPlayer || 0;
  }

  // Get player by seat index
  getPlayerBySeat(seatIndex) {
    return this.players[seatIndex];
  }

  // Get all human players
  getHumanPlayers() {
    return this.players.filter(p => p && p.type === 'human');
  }

  // Get all bot players
  getBotPlayers() {
    return this.players.filter(p => p && p.type === 'bot');
  }

  // Check if game is full
  isFull() {
    return this.players.filter(p => p !== null).length === 4;
  }

  // Check if game has started
  hasStarted() {
    return this.status === 'PLAYING' || this.status === 'BIDDING';
  }

  // Get next player index
  getNextPlayerIndex() {
    return (this.getCurrentPlayerIndex() + 1) % 4;
  }

  // Update game state
  updateState(updates) {
    Object.assign(this, updates);
    return this;
  }

  // Convert to JSON for client
  toClientFormat() {
    return {
      id: this.id,
      status: this.status,
      mode: this.mode,
      maxPoints: this.maxPoints,
      minPoints: this.minPoints,
      buyIn: this.buyIn,
      players: this.players,
      currentPlayer: this.currentPlayer,
      currentRound: this.currentRound,
      currentTrick: this.currentTrick,
      dealer: this.dealer,
      hands: this.hands,
      bidding: this.bidding,
      play: this.play,
      rules: this.rules,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt
    };
  }
}
