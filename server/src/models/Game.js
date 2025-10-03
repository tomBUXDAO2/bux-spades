// Clean game state model
export class Game {
  constructor(data = {}) {
    this.id = data.id;
    this.status = data.status || 'WAITING';
    
    // EMERGENCY: Log if game is being created with FINISHED status
    if (data.status === 'FINISHED') {
      console.error(`[EMERGENCY LOG] GAME CREATED WITH FINISHED STATUS: ${this.id}`);
      console.trace('[EMERGENCY LOG] Stack trace for game creation with FINISHED status');
    }
    this.mode = data.mode || 'PARTNERS';
    this.maxPoints = data.maxPoints || 200;
    this.minPoints = data.minPoints || -100;
    this.buyIn = data.buyIn || 0;
    this.players = data.players || [null, null, null, null]; // Initialize with 4 null seats
    this.currentPlayer = data.currentPlayer || null;
    this.currentRound = data.currentRound || 1;
    this.currentTrick = data.currentTrick || 0;
    this.dealer = data.dealer !== undefined ? data.dealer : Math.floor(Math.random() * 4); // Random dealer 0-3 if not specified
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
    
    // Rules - construct after all main properties are set
    this.rules = {
      gameType: 'PARTNERS',
      allowNil: true,
      allowBlindNil: false,
      coinAmount: 0,
      maxPoints: this.maxPoints, // Use the instance maxPoints
      minPoints: this.minPoints, // Use the instance minPoints
      bidType: 'REGULAR',
      specialRules: {
        screamer: false,
        assassin: false
      },
      ...(data.rules || {}) // Merge any provided rules, but maxPoints/minPoints take precedence
    };
    
    // Ensure rules always use the correct maxPoints/minPoints values
    this.rules.maxPoints = this.maxPoints;
    this.rules.minPoints = this.minPoints;
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

  // Start the game - deal cards and begin bidding
  start() {
    if (this.status !== 'WAITING') {
      return false;
    }

    // Check if we have at least one player
    if (this.players.filter(p => p).length === 0) {
      return false;
    }

    // Deal cards
    this.dealCards();
    
    // Start bidding
    this.status = 'BIDDING';
    this.startedAt = new Date();
    
    // Set first bidder (dealer + 1)
    this.bidding.currentBidderIndex = (this.dealer + 1) % 4;
    this.bidding.currentPlayer = this.players[this.bidding.currentBidderIndex]?.id || null;
    this.currentPlayer = this.bidding.currentPlayer;

    console.log(`[GAME] Game ${this.id} started, first bidder: ${this.bidding.currentPlayer}`);
    return true;
  }

  // Deal cards to all players
  dealCards() {
    const suits = ['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    
    // Create deck
    const deck = [];
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ suit, rank });
      }
    }

    // Shuffle deck
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    // Deal 13 cards to each player
    this.hands = [[], [], [], []];
    for (let i = 0; i < 52; i++) {
      const playerIndex = i % 4;
      const cardIndex = Math.floor(i / 4);
      this.hands[playerIndex].push(deck[i]);
    }

    console.log(`[GAME] Dealt cards to ${this.players.filter(p => p).length} players`);
  }

  // Check if a player can make a bid
  canMakeBid(userId, bid, isNil = false, isBlindNil = false) {
    // Check game status
    if (this.status !== 'BIDDING') {
      return false;
    }

    // Check if player exists
    const player = this.players.find(p => p && p.id === userId);
    if (!player) {
      return false;
    }

    // Check if it's the player's turn
    if (this.bidding.currentPlayer !== userId) {
      return false;
    }

    // Validate bid range
    if (bid < 0 || bid > 13) {
      return false;
    }

    // Check nil bid rules
    if (isNil && !this.rules?.allowNil) {
      return false;
    }

    if (isBlindNil && !this.rules?.allowBlindNil) {
      return false;
    }

    return true;
  }

  // Check if a player can play a card
  canPlayCard(userId, card) {
    // Check if game is in playing phase
    if (this.status !== 'PLAYING') {
      return false;
    }

    // Check if it's the player's turn
    if (this.play.currentPlayer !== userId) {
      return false;
    }

    // Check if card is in player's hand
    const player = this.players.find(p => p && p.id === userId);
    if (!player) {
      return false;
    }

    const playerHand = this.hands[player.seatIndex] || [];
    const cardInHand = playerHand.find(c => c.suit === card.suit && c.rank === card.rank);
    if (!cardInHand) {
      return false;
    }

    return true;
  }

  // Get player seat index by user ID
  getPlayerSeatIndex(userId) {
    const player = this.players.find(p => p && p.id === userId);
    return player ? player.seatIndex : -1;
  }

  // Get current round number
  getCurrentRound() {
    return this.currentRound;
  }

  // Get current trick number
  getCurrentTrick() {
    return this.play.trickNumber;
  }

  // Get current trick cards
  getCurrentTrickCards() {
    return this.play.currentTrick;
  }

  // Get last completed trick
  getLastCompletedTrick() {
    return this.play.tricks[this.play.tricks.length - 1] || [];
  }

  // Get current player
  getCurrentPlayer() {
    return this.currentPlayer;
  }

  // Get bids
  getBids() {
    return this.bidding.bids;
  }

  // Make a bid
  makeBid(userId, bid, isNil = false, isBlindNil = false) {
    if (!this.canMakeBid(userId, bid, isNil, isBlindNil)) {
      return false;
    }

    const player = this.players.find(p => p && p.id === userId);

    // Record the bid
    player.bid = bid;
    this.bidding.bids[player.seatIndex] = bid;
    
    if (isNil) {
      this.bidding.nilBids[player.seatIndex] = { isNil: true, isBlindNil };
    }

    // Move to next player
    this.bidding.currentBidderIndex = (this.bidding.currentBidderIndex + 1) % 4;
    this.bidding.currentPlayer = this.players[this.bidding.currentBidderIndex]?.id || null;
    this.currentPlayer = this.bidding.currentPlayer;

    console.log(`[GAME] Player ${player.username} bid ${bid} (nil: ${isNil})`);
    return true;
  }

  // Check if bidding is complete
  isBiddingComplete() {
    return this.bidding.bids.filter(bid => bid !== null).length === 4;
  }

  // Start the play phase
  startPlay() {
    if (this.status !== 'BIDDING' || !this.isBiddingComplete()) {
      return false;
    }

    this.status = 'PLAYING';
    this.play.currentPlayerIndex = (this.dealer + 1) % 4;
    this.play.currentPlayer = this.players[this.play.currentPlayerIndex]?.id || null;
    this.currentPlayer = this.play.currentPlayer;
    this.play.currentTrick = [];
    this.play.trickNumber = 1;

    console.log(`[GAME] Started play phase, first player: ${this.play.currentPlayer}`);
    return true;
  }

  // Play a card
  playCard(userId, card) {
    console.log(`[GAME PLAY CARD] Attempting to play card for user ${userId}:`, card);
    console.log(`[GAME PLAY CARD] Game status: ${this.status}, currentPlayer: ${this.play?.currentPlayer}`);
    
    if (this.status !== 'PLAYING') {
      console.log(`[GAME PLAY CARD] Failed: status is ${this.status}, not PLAYING`);
      return false;
    }

    const player = this.players.find(p => p && p.id === userId);
    if (!player) {
      console.log(`[GAME PLAY CARD] Failed: player not found for userId ${userId}`);
      return false;
    }

    // Validate it's the player's turn
    if (this.play.currentPlayer !== userId) {
      console.log(`[GAME PLAY CARD] Failed: not player's turn. Current: ${this.play.currentPlayer}, Player: ${userId}`);
      return false;
    }

    // Validate card is in player's hand
    const playerHand = this.hands[player.seatIndex] || [];
    const cardIndex = playerHand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (cardIndex === -1) {
      return false;
    }

    // Remove card from hand
    playerHand.splice(cardIndex, 1);

    // Add card to current trick
    this.play.currentTrick.push({
      ...card,
      playerId: userId,
      seatIndex: player.seatIndex
    });

    console.log(`[GAME] Player ${player.username} played ${card.suit}${card.rank}`);

    // Move to next player
    this.play.currentPlayerIndex = (this.play.currentPlayerIndex + 1) % 4;
    this.play.currentPlayer = this.players[this.play.currentPlayerIndex]?.id || null;
    this.currentPlayer = this.play.currentPlayer;

    return true;
  }

  // Create a new trick
  createTrick() {
    const trick = {
      id: `trick_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      roundId: this.getCurrentRound(),
      trickNumber: this.play.trickNumber,
      cards: [],
      createdAt: new Date()
    };
    
    return trick;
  }

  // Get or create current trick ID
  getCurrentTrickId() {
    // If this is the first card of a new trick, create a new trick
    if (this.play.currentTrick.length === 0) {
      const trick = this.createTrick();
      this.currentTrickId = trick.id;
      return trick.id;
    }
    
    return this.currentTrickId || `trick_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Check if trick is complete (4 cards played)
  isTrickComplete() {
    return this.play.currentTrick.length === 4;
  }

  // Calculate trick winner
  calculateTrickWinner() {
    if (!this.isTrickComplete()) {
      return -1;
    }

    const leadSuit = this.play.currentTrick[0].suit;
    let winner = 0;
    let winningCard = this.play.currentTrick[0];

    for (let i = 1; i < 4; i++) {
      const card = this.play.currentTrick[i];
      
      // Spades beat non-spades
      if (card.suit === 'SPADES' && winningCard.suit !== 'SPADES') {
        winner = i;
        winningCard = card;
      }
      // Same suit - higher rank wins
      else if (card.suit === winningCard.suit && this.getCardValue(card.rank) > this.getCardValue(winningCard.rank)) {
        winner = i;
        winningCard = card;
      }
      // Follow lead suit beats non-lead suit
      else if (card.suit === leadSuit && winningCard.suit !== leadSuit && winningCard.suit !== 'SPADES') {
        winner = i;
        winningCard = card;
      }
    }

    return this.play.currentTrick[winner].seatIndex;
  }

  // Get card value for comparison
  getCardValue(rank) {
    const values = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
      'J': 11, 'Q': 12, 'K': 13, 'A': 14
    };
    return values[rank] || 0;
  }

  // Complete the current trick
  completeTrick(winnerSeatIndex) {
    console.log(`[GAME] completeTrick called with winnerSeatIndex: ${winnerSeatIndex}`);
    console.log(`[GAME] isTrickComplete(): ${this.isTrickComplete()}`);
    console.log(`[GAME] currentTrick length: ${this.play.currentTrick.length}`);
    console.log(`[GAME] currentTrick:`, this.play.currentTrick);
    
    if (!this.isTrickComplete()) {
      console.log(`[GAME] Trick not complete, returning false`);
      return false;
    }

    // Store completed trick
    const completedTrick = {
      cards: [...this.play.currentTrick],
      winner: winnerSeatIndex,
      trickNumber: this.play.trickNumber
    };

    this.play.tricks.push(completedTrick);
    this.play.trickNumber++;

    // Award trick to winner
    console.log(`[GAME] completeTrick called with winnerSeatIndex: ${winnerSeatIndex}`);
    console.log(`[GAME] Current players:`, this.players?.map(p => ({ id: p?.id, seatIndex: p?.seatIndex, tricks: p?.tricks })));
    const winner = this.players[winnerSeatIndex];
    console.log(`[GAME] Winner object:`, winner);
    if (winner) {
      const oldTricks = winner.tricks || 0;
      winner.tricks = oldTricks + 1;
      console.log(`[GAME] Awarded trick to seat ${winnerSeatIndex}: ${oldTricks} -> ${winner.tricks}`);
      console.log(`[GAME] Winner after update:`, { id: winner.id, tricks: winner.tricks });
    } else {
      console.log(`[GAME] ERROR: No winner found at seat ${winnerSeatIndex}`);
      console.log(`[GAME] Available players:`, this.players?.map((p, i) => ({ index: i, id: p?.id, seatIndex: p?.seatIndex })));
    }

    // CRITICAL FIX: Remove cards from hands
    this.play.currentTrick.forEach(card => {
      const player = this.players[card.seatIndex];
      if (player && this.hands[card.seatIndex]) {
        // Remove the card from the player's hand
        const handIndex = this.hands[card.seatIndex].findIndex(h => 
          h.suit === card.suit && h.rank === card.rank
        );
        if (handIndex !== -1) {
          this.hands[card.seatIndex].splice(handIndex, 1);
          console.log(`[GAME] Removed ${card.suit}${card.rank} from seat ${card.seatIndex} hand`);
        }
      }
    });

    // Clear current trick and set winner as next player
    this.play.currentTrick = [];
    this.play.currentPlayerIndex = winnerSeatIndex;
    this.play.currentPlayer = this.players[winnerSeatIndex]?.id || null;
    this.currentPlayer = this.play.currentPlayer;

    console.log(`[GAME] Trick completed, winner: seat ${winnerSeatIndex}`);
    return true;
  }

  // Check if round is complete (13 tricks played)
  isRoundComplete() {
    return this.play.tricks.length === 13;
  }

  // Start next round
  startNextRound() {
    this.currentRound++;
    this.currentTrick = 0;
    
    // Deal new cards
    this.dealCards();
    
    // Reset bidding
    this.status = 'BIDDING';
    this.bidding.currentBidderIndex = (this.dealer + 1) % 4;
    this.bidding.currentPlayer = this.players[this.bidding.currentBidderIndex]?.id || null;
    this.bidding.bids = [null, null, null, null];
    this.bidding.nilBids = {};
    this.currentPlayer = this.bidding.currentPlayer;

    // Reset play state
    this.play.currentTrick = [];
    this.play.tricks = [];
    this.play.trickNumber = 1;
    this.play.spadesBroken = false;

    console.log(`[GAME] Started round ${this.currentRound}`);
  }

  // Start next trick
  startNextTrick() {
    this.currentTrick++;
    this.play.currentTrick = [];
    this.play.trickNumber = this.currentTrick;

    console.log(`[GAME] Started trick ${this.currentTrick}`);
  }

  // Get current round number
  getCurrentRound() {
    return this.currentRound || 1;
  }

  // Get current trick number
  getCurrentTrick() {
    return this.currentTrick || 0;
  }

  // Get current trick cards
  getCurrentTrickCards() {
    return this.play?.currentTrick || [];
  }

  // Get last completed trick
  getLastCompletedTrick() {
    return this.play?.tricks?.[this.play.tricks.length - 1] || null;
  }

  // Get all bids
  getBids() {
    return this.bidding?.bids || [null, null, null, null];
  }

  // Get current bidder
  getCurrentBidder() {
    if (this.bidding?.currentBidderIndex !== undefined) {
      return this.players[this.bidding.currentBidderIndex];
    }
    return null;
  }

  // Check if game is complete
  isGameComplete() {
    // Game is complete when a team reaches maxPoints or falls below minPoints
    // Check all players' scores
    const team0Score = (this.players[0]?.points || 0) + (this.players[2]?.points || 0);
    const team1Score = (this.players[1]?.points || 0) + (this.players[3]?.points || 0);
    
    if (team0Score >= this.maxPoints || team0Score <= this.minPoints) {
      return true;
    }
    
    if (team1Score >= this.maxPoints || team1Score <= this.minPoints) {
      return true;
    }
    
    return false;
  }

  // Scoring is now handled by ScoringService in database
  // No in-memory scoring calculations

  // Winner is determined by ScoringService in database
  // No in-memory winner calculation

  // Check if user can start the game
  canStart(userId) {
    // Only allow if game is waiting and user is the creator or a player
    if (this.status !== 'WAITING') {
      return false;
    }

    const player = this.players.find(p => p && p.id === userId);
    return player !== undefined;
  }

  // Add player to game
  addPlayer(playerData) {
    const { id, username, avatarUrl, seatIndex, team, isHuman } = playerData;
    
    if (this.players[seatIndex]) {
      return false; // Seat already occupied
    }
    
    this.players[seatIndex] = {
      id: id,
      username: username || 'Unknown',
      avatarUrl: avatarUrl || null,
      seatIndex: seatIndex,
      team: team || (seatIndex % 2),
      type: isHuman ? 'human' : 'bot',
      connected: true,
      hand: [],
      bid: null,
      tricks: 0,
      points: 0,
      bags: 0,
      nil: false,
      blindNil: false
    };
    
    return true;
  }

  // Find open seat
  findOpenSeat() {
    for (let i = 0; i < 4; i++) {
      if (!this.players[i]) {
        return i;
      }
    }
    return -1; // No open seats
  }

  // Remove player from game
  removePlayer(userId) {
    const playerIndex = this.players.findIndex(p => p && p.id === userId);
    if (playerIndex !== -1) {
      this.players[playerIndex] = null;
      return true;
    }
    return false;
  }

  // Get player by user ID
  getPlayer(userId) {
    return this.players.find(p => p && p.id === userId) || null;
  }

  // Convert to JSON for database storage
  toJSON() {
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
