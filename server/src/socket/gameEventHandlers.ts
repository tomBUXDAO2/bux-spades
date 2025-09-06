import { io } from '../server';
import { games } from '../gamesStore';
import { clearTurnTimeout, startTurnTimeout } from '../game-logic/timeoutHandlers';
import { botMakeMove, botPlayCard, enrichGameForClient, assignDealer, dealCards } from '../routes/games.routes';
import { trickLogger } from '../lib/trickLogger';
import prisma from '../lib/prisma';
import type { AuthenticatedSocket } from '../server';
import type { Game, Card } from '../types/game';

// ChatMessage interface matching client-side
interface ChatMessage {
  id?: string;
  userId: string;
  userName: string;
  message: string;
  text?: string;
  user?: string;
  timestamp: number;
  isGameMessage?: boolean;
}

export function registerGameEventHandlers(socket: AuthenticatedSocket) {
  // Make bid event
  socket.on('make_bid', async ({ gameId, userId, bid }) => {
    await handleMakeBid(socket, gameId, userId, bid);
  });

  // Play card event
  socket.on('play_card', async ({ gameId, cardIndex }) => {
    await handlePlayCard(socket, gameId, cardIndex);
  });

  // Join game event
  socket.on('join_game', async ({ gameId, userId, testPlayer, watchOnly }) => {
    await handleJoinGame(socket, gameId, userId, testPlayer, watchOnly);
  });

  // Leave game event
  socket.on('leave_game', async ({ gameId, userId }) => {
    await handleLeaveGame(socket, gameId, userId);
  });

  // Chat message event
  socket.on('chat_message', async ({ gameId, message }) => {
    await handleChatMessage(socket, gameId, message);
  });

  // Lobby chat message event
  socket.on('lobby_chat_message', async ({ message }) => {
    await handleLobbyChatMessage(socket, message);
  });

  // Fill seat with bot event
  socket.on('fill_seat_with_bot', async ({ gameId, seatIndex }) => {
    await handleFillSeatWithBot(socket, gameId, seatIndex);
  });

  // Start game event
  socket.on('start_game', async ({ gameId }) => {
    await handleStartGame(socket, gameId);
  });
}

async function handleMakeBid(socket: AuthenticatedSocket, gameId: string, userId: string, bid: number) {
  console.log(`[BID] User ${userId} making bid ${bid} in game ${gameId}`);
  
  const game = games.find(g => g.id === gameId);
  if (!game) {
    socket.emit('error', { message: 'Game not found' });
    return;
  }

  if (game.status !== 'BIDDING') {
    socket.emit('error', { message: 'Game is not in bidding phase' });
    return;
  }

  const playerIndex = game.players.findIndex(p => p && p.id === userId);
  if (playerIndex === -1) {
    socket.emit('error', { message: 'Player not found in game' });
    return;
  }

  if (game.bidding?.currentBidderIndex !== playerIndex) {
    socket.emit('error', { message: 'Not your turn to bid' });
    return;
  }

  // Record the bid
  if (game.players[playerIndex]) {
    game.players[playerIndex]!.bid = bid;
  }
  if (game.bidding) {
    game.bidding.bids[playerIndex] = bid;
    game.bidding.currentBidderIndex = (game.bidding.currentBidderIndex + 1) % 4;
  }

  // Check if all players have bid
  if (game.bidding && game.bidding.currentBidderIndex === game.dealerIndex) {
    // All players have bid, start playing phase
    game.status = 'PLAYING';
    if (game.play) {
      game.play.currentPlayerIndex = (game.dealerIndex! + 1) % 4;
    }
    
    // Start first turn timeout
    startTurnTimeout(game, (game.dealerIndex! + 1) % 4, 'playing');
  } else if (game.bidding) {
    // Continue bidding
    startTurnTimeout(game, game.bidding.currentBidderIndex, 'bidding');
  }

  // Broadcast game update
  io.to(gameId).emit('game_update', enrichGameForClient(game));
}

async function handlePlayCard(socket: AuthenticatedSocket, gameId: string, cardIndex: number) {
  console.log(`[PLAY CARD] User playing card ${cardIndex} in game ${gameId}`);
  
  const game = games.find(g => g.id === gameId);
  if (!game) {
    socket.emit('error', { message: 'Game not found' });
    return;
  }

  if (game.status !== 'PLAYING') {
    socket.emit('error', { message: 'Game is not in playing phase' });
    return;
  }

  const playerIndex = game.players.findIndex(p => p && p.id === socket.userId);
  if (playerIndex === -1) {
    socket.emit('error', { message: 'Player not found in game' });
    return;
  }

  if (game.play?.currentPlayerIndex !== playerIndex) {
    socket.emit('error', { message: 'Not your turn to play' });
    return;
  }

  const player = game.players[playerIndex]!;
  if (!player.hand || cardIndex < 0 || cardIndex >= player.hand.length) {
    socket.emit('error', { message: 'Invalid card index' });
    return;
  }

  const card = player.hand[cardIndex];
  
  // Remove card from hand
  player.hand.splice(cardIndex, 1);
  
  // Add card to current trick
  if (game.play) {
    game.play.currentTrick.push({
      ...card,
      playedBy: player.id,
      playerIndex
    });
  }

  // Check if trick is complete
  if (game.play && game.play.currentTrick.length === 4) {
    // Determine trick winner (simplified)
    const winnerIndex = 0; // Placeholder - implement proper spades logic
    game.play.tricks.push({
      cards: game.play.currentTrick,
      winnerIndex
    });
    game.play.currentTrick = [];
    game.play.currentPlayerIndex = winnerIndex;
    
    // Check if round is complete
    if (game.players.every(p => !p || !p.hand || p.hand.length === 0)) {
      // Round complete
      game.status = 'WAITING';
    } else {
      // Continue playing
      startTurnTimeout(game, game.play.currentPlayerIndex, 'playing');
    }
  } else if (game.play) {
    // Move to next player
    game.play.currentPlayerIndex = (game.play.currentPlayerIndex + 1) % 4;
    startTurnTimeout(game, game.play.currentPlayerIndex, 'playing');
  }

  // Broadcast game update
  io.to(gameId).emit('game_update', enrichGameForClient(game));
}

async function handleJoinGame(socket: AuthenticatedSocket, gameId: string, userId: string, testPlayer?: any, watchOnly?: boolean) {
  // Use socket userId if parameter is undefined
  const actualUserId = userId || socket.userId;
  if (!actualUserId) {
    socket.emit('error', { message: 'User not authenticated' });
    return;
  }
  console.log(`[JOIN GAME] User ${actualUserId} joining game ${gameId}`);
  
  const game = games.find(g => g.id === gameId);
  if (!game) {
    socket.emit('error', { message: 'Game not found' });
    return;
  }

  if (game.status !== 'WAITING') {
    socket.emit('error', { message: 'Game has already started' });
    return;
  }

  // Find empty seat
  const emptySeatIndex = game.players.findIndex(p => p === null);
  if (emptySeatIndex === -1) {
    socket.emit('error', { message: 'Game is full' });
    return;
  }

  // Add player to seat
  game.players[emptySeatIndex] = {
    id: actualUserId,
    username: testPlayer?.name || socket.auth?.username || 'Player',
    avatar: testPlayer?.image || socket.auth?.avatar || null,
    type: 'human',
    position: emptySeatIndex,
    hand: [],
    bid: 0,
    tricks: 0,
    team: emptySeatIndex % 2 === 0 ? 1 : 2,
    isDealer: false,
    discordId: socket.auth?.discordId
  };

  // Join socket room
  socket.join(gameId);

  // Broadcast game update
  io.to(gameId).emit('game_update', enrichGameForClient(game));
  io.emit('games_updated', games);
}

async function handleLeaveGame(socket: AuthenticatedSocket, gameId: string, userId: string) {
  console.log(`[LEAVE GAME] User ${userId} leaving game ${gameId}`);
  
  const game = games.find(g => g.id === gameId);
  if (!game) {
    return;
  }

  // Remove player from seat
  const playerIndex = game.players.findIndex(p => p && p.id === userId);
  if (playerIndex !== -1) {
    game.players[playerIndex] = null;
  }

  // Leave socket room
  socket.leave(gameId);

  // Broadcast game update
  io.to(gameId).emit('game_update', enrichGameForClient(game));
  io.emit('games_updated', games);
}

async function handleChatMessage(socket: AuthenticatedSocket, gameId: string, message: ChatMessage) {
  console.log("=== CHAT MESSAGE EVENT RECEIVED ===");
  console.log("Chat message received:", { gameId, message, socketId: socket.id, userId: socket.userId });

  if (!socket.isAuthenticated || !socket.userId) {
    socket.emit("error", { message: "Not authorized" });
    return;
  }

  const game = games.find(g => g.id === gameId);
  if (!game) {
    socket.emit("error", { message: "Game not found" });
    return;
  }

  game.lastActivity = Date.now();
  updateGameActivity(gameId);

  // Simple in-memory token bucket per socket
  const now = Date.now();
  const bucket = (socket.data as any).chatBucket || { tokens: 5, lastRefill: now };
  const elapsed = now - bucket.lastRefill;
  const refill = Math.floor(elapsed / 1000) * 2; // 2 tokens/sec
  bucket.tokens = Math.min(20, bucket.tokens + refill);
  bucket.lastRefill = now;
  console.log(`[CHAT DEBUG] User ${socket.userId} chat bucket state:`, { tokens: bucket.tokens, elapsed, refill });
  if (bucket.tokens <= 0) {
    console.log(`[CHAT DEBUG] Message dropped due to rate limit for user ${socket.userId}`);
    return; // drop silently
  }
  bucket.tokens -= 1;
  (socket.data as any).chatBucket = bucket;

  // Handle both string and ChatMessage object formats
  let messageText: string;
  if (typeof message === 'string') {
    messageText = message;
  } else if (message && typeof message.message === 'string') {
    messageText = message.message;
  } else {
    console.log(`[CHAT DEBUG] Message dropped due to invalid format for user ${socket.userId}:`, message);
    return;
  }

  if (messageText.length === 0 || messageText.length > 500) {
    console.log(`[CHAT DEBUG] Message dropped due to invalid length for user ${socket.userId}:`, messageText);
    return;
  }

  console.log(`[CHAT DEBUG] Message validation passed for user ${socket.userId}:`, messageText);

  // Create proper ChatMessage object for broadcast
  const chatMessage: ChatMessage = {
    id: `${socket.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId: socket.userId,
    userName: socket.auth?.username || 'Player',
    message: messageText,
    timestamp: Date.now(),
    isGameMessage: true
  };

  // Broadcast to all players in the game room
  io.to(gameId).emit("chat_message", { gameId, message: chatMessage });
  console.log(`[CHAT DEBUG] Game chat message broadcast to game ${gameId}`);
}

async function handleLobbyChatMessage(socket: AuthenticatedSocket, message: ChatMessage | string) {
  console.log("=== LOBBY CHAT MESSAGE EVENT RECEIVED ===");
  console.log("Lobby chat message received:", { message, socketId: socket.id, userId: socket.userId });

  if (!socket.isAuthenticated || !socket.userId) {
    socket.emit("error", { message: "Not authorized" });
    return;
  }

  // Simple in-memory token bucket per socket
  const now = Date.now();
  const bucket = (socket.data as any).chatBucket || { tokens: 5, lastRefill: now };
  const elapsed = now - bucket.lastRefill;
  const refill = Math.floor(elapsed / 1000) * 2; // 2 tokens/sec
  bucket.tokens = Math.min(20, bucket.tokens + refill);
  bucket.lastRefill = now;
  console.log(`[CHAT DEBUG] User ${socket.userId} lobby chat bucket state:`, { tokens: bucket.tokens, elapsed, refill });
  if (bucket.tokens <= 0) {
    console.log(`[CHAT DEBUG] Lobby message dropped due to rate limit for user ${socket.userId}`);
    return; // drop silently
  }
  bucket.tokens -= 1;
  (socket.data as any).chatBucket = bucket;

  // Handle both string and ChatMessage object formats
  let messageText: string;
  if (typeof message === 'string') {
    messageText = message;
  } else if (message && typeof message.message === 'string') {
    messageText = message.message;
  } else {
    console.log(`[CHAT DEBUG] Lobby message dropped due to invalid format for user ${socket.userId}:`, message);
    return;
  }

  if (messageText.length === 0 || messageText.length > 500) {
    console.log(`[CHAT DEBUG] Lobby message dropped due to invalid length for user ${socket.userId}:`, messageText);
    return;
  }

  console.log(`[CHAT DEBUG] Lobby message validation passed for user ${socket.userId}:`, messageText);

  // Create proper ChatMessage object for broadcast
  const chatMessage: ChatMessage = {
    id: `${socket.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId: socket.userId,
    userName: socket.auth?.username || 'Player',
    message: messageText,
    timestamp: Date.now(),
    isGameMessage: false
  };

  // Broadcast to all connected users in lobby
  io.emit("lobby_chat_message", chatMessage);
  console.log(`[CHAT DEBUG] Lobby chat message broadcast globally`);
}

async function handleFillSeatWithBot(socket: AuthenticatedSocket, gameId: string, seatIndex: number) {
  console.log(`[FILL SEAT] Filling seat ${seatIndex} with bot in game ${gameId}`);
  
  const game = games.find(g => g.id === gameId);
  if (!game) {
    socket.emit('error', { message: 'Game not found' });
    return;
  }

  if (game.status !== 'WAITING') {
    socket.emit('error', { message: 'Game has already started' });
    return;
  }

  if (seatIndex < 0 || seatIndex >= 4) {
    socket.emit('error', { message: 'Invalid seat index' });
    return;
  }

  if (game.players[seatIndex] !== null) {
    // Seat is already occupied, send current game state instead of error
    socket.emit('game_update', enrichGameForClient(game));
    return;
  }

  // Add bot to seat
  const botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  game.players[seatIndex] = {
    id: botId,
    username: `Bot ${seatIndex + 1}`,
    avatar: null,
    type: 'bot',
    position: seatIndex,
    hand: [],
    bid: 0,
    tricks: 0,
    team: seatIndex % 2 === 0 ? 1 : 2,
    isDealer: false
  };

  // Broadcast game update
  io.to(gameId).emit('game_update', enrichGameForClient(game));
  io.emit('games_updated', games);
}

async function handleStartGame(socket: AuthenticatedSocket, gameId: string) {
  console.log(`[START GAME] Starting game ${gameId}`);
  
  const game = games.find(g => g.id === gameId);
  if (!game) {
    socket.emit('error', { message: 'Game not found' });
    return;
  }

  if (game.status !== 'WAITING') {
    socket.emit('error', { message: 'Game has already started' });
    return;
  }

  // Check if all seats are filled
  if (game.players.some(p => p === null)) {
    socket.emit('error', { message: 'All seats must be filled to start the game' });
    return;
  }

  // Start the game
  game.status = 'BIDDING';
  game.dealerIndex = assignDealer(game.players, game.dealerIndex || 0);
  
  // Initialize bidding state
  game.bidding = {
    currentPlayer: game.players[(game.dealerIndex + 1) % 4]!.id,
    currentBidderIndex: (game.dealerIndex + 1) % 4,
    bids: [null, null, null, null],
    nilBids: {}
  };
  
  // Deal cards
  const hands = dealCards(game.players, game.dealerIndex);
  game.players.forEach((player, index) => {
    if (player) {
      player.hand = hands[index];
    }
  });

  // Start bidding phase
  const firstBidder = game.players[game.bidding.currentBidderIndex];
  if (firstBidder && firstBidder.type === 'bot') {
    // Bot makes first bid
    botMakeMove(game, game.bidding.currentBidderIndex);
  } else {
    // Human player, start timeout
    startTurnTimeout(game, game.bidding.currentBidderIndex, 'bidding');
  }

  // Broadcast game started
  io.to(gameId).emit('game_started', { gameId, game: enrichGameForClient(game) });
  io.to(gameId).emit('game_update', enrichGameForClient(game));
  io.emit('games_updated', games);
}

function updateGameActivity(gameId: string) {
  // Update game activity timestamp
  const game = games.find(g => g.id === gameId);
  if (game) {
    game.lastActivity = Date.now();
  }
}
