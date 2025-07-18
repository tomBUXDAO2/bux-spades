import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import passport from 'passport';
import session from 'express-session';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

import authRoutes from './routes/auth.routes';
import discordRoutes from './routes/discord.routes';
import gamesRoutes, { games, assignDealer, dealCards, botMakeMove, botPlayCard, determineTrickWinner } from './routes/games.routes';
import usersRoutes from './routes/users.routes';
import socialRoutes from './routes/social.routes';
import './config/passport';
import type { Game, GamePlayer } from './types/game';

const app = express();
const httpServer = createServer(app);
const prisma = new PrismaClient();

// Body parsing middleware MUST come first
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Universal CORS handler
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Expose-Headers', 'Set-Cookie');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const allowedOrigins = [
  'http://localhost:5173',
  'https://bux-spades.pro',
  'https://www.bux-spades.pro',
  'https://bux-spades.vercel.app'
];

// Socket.IO setup
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Set-Cookie']
  },
  path: '/socket.io',
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  allowUpgrades: true,
  cookie: process.env.NODE_ENV === 'production' ? {
    name: 'io',
    path: '/',
    httpOnly: true,
    sameSite: 'none',
    secure: true
  } : false,
  upgradeTimeout: 30000,
  maxHttpBufferSize: 1e8,
  perMessageDeflate: {
    threshold: 2048
  }
});

// Extend Socket type to allow userId property
export interface AuthenticatedSocket extends Socket {
  userId?: string;
  isAuthenticated?: boolean;
  auth?: {
    userId?: string;
    username?: string;
    token?: string;
    avatar?: string;
  };
}

const onlineUsers = new Set<string>();
const authenticatedSockets = new Map<string, AuthenticatedSocket>();

// Export io for use in routes
export { io, onlineUsers };

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Debug middleware to log requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`, req.body);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', discordRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/social', socialRoutes);

// Add this at the end, after all routes
// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    message: err.message || 'Something went wrong!',
  });
});

// Socket.IO connection handling
io.use((socket: AuthenticatedSocket, next) => {
  const auth = socket.handshake.auth;
  const authHeader = socket.handshake.headers.authorization;
  const token = auth?.token || (authHeader && authHeader.split(' ')[1]);

  console.log('Socket auth attempt:', {
    hasUserId: !!auth?.userId,
    hasToken: !!token,
    socketId: socket.id,
    headers: socket.handshake.headers,
    auth: auth
  });

  if (!auth?.userId || !token) {
    console.log('Authentication failed: Missing userId or token');
    return next(new Error('Authentication required'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    console.log('Token decoded:', {
      decodedUserId: decoded.userId,
      authUserId: auth.userId,
      match: decoded.userId === auth.userId
    });

    // Extract the actual user ID from the auth object
    const authUserId = typeof auth.userId === 'object' && auth.userId.user ? auth.userId.user.id : auth.userId;

    if (decoded.userId === authUserId) {
      socket.userId = authUserId;
      socket.auth = { 
        ...auth, 
        token,
        userId: authUserId,
        username: typeof auth.userId === 'object' && auth.userId.user ? auth.userId.user.username : undefined,
        avatar: typeof auth.userId === 'object' && auth.userId.user ? auth.userId.user.avatar : undefined
      };
      socket.isAuthenticated = true;
      console.log('Socket authenticated successfully:', {
        userId: socket.userId,
        socketId: socket.id
      });
      return next();
    }
    console.log('Authentication failed: Token userId mismatch');
    return next(new Error('Invalid token'));
  } catch (err) {
    console.error('Token verification error:', err);
    return next(new Error('Invalid token'));
  }
});

io.on('connection', (socket: AuthenticatedSocket) => {
  console.log('Client connected:', {
    socketId: socket.id,
    userId: socket.userId,
    isAuthenticated: socket.isAuthenticated,
    auth: socket.auth
  });

  if (socket.userId) {
    authenticatedSockets.set(socket.userId, socket);
    onlineUsers.add(socket.userId);
    io.emit('online_users', Array.from(onlineUsers));
    console.log('User connected:', {
      userId: socket.userId,
      onlineUsers: Array.from(onlineUsers)
    });
    socket.emit('authenticated', { 
      success: true, 
      userId: socket.userId,
      games: Array.from(socket.rooms).filter(room => room !== socket.id)
    });
  }

  // Handle chat messages
  socket.on('chat_message', ({ gameId, message }) => {
    if (!socket.isAuthenticated || !socket.userId) {
      console.log('Unauthorized chat message attempt:', { 
        socketId: socket.id, 
        isAuthenticated: socket.isAuthenticated,
        userId: socket.userId 
      });
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    if (!gameId || !message) {
      console.log('Invalid chat message format:', { gameId, message });
      return;
    }

    // Validate message format
    if (!message.userId || !message.message) {
      console.log('Invalid message format:', message);
      return;
    }

    // Add timestamp and ID if not present
    const enrichedMessage = {
      ...message,
      id: message.id || `${message.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: message.timestamp || Date.now(),
      userName: message.userName || (message.userId === 'system' ? 'System' : socket.auth?.username || 'Unknown')
    };

    console.log('Broadcasting chat message:', {
      gameId,
      message: enrichedMessage,
      room: socket.rooms.has(gameId)
    });

    // Broadcast to game room
    io.to(gameId).emit('chat_message', { gameId, message: enrichedMessage });
  });

  // Handle lobby chat messages
  socket.on('lobby_chat_message', (message) => {
    if (!socket.isAuthenticated || !socket.userId) {
      console.log('Unauthorized lobby chat message attempt:', { 
        socketId: socket.id, 
        isAuthenticated: socket.isAuthenticated,
        userId: socket.userId 
      });
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    if (!message || !message.message) {
      console.log('Invalid lobby message format:', message);
      return;
    }

    // Validate message format
    if (!message.userId) {
      console.log('Invalid lobby message format:', message);
      return;
    }

    // Add timestamp and ID if not present
    const enrichedMessage = {
      ...message,
      id: message.id || `${message.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: message.timestamp || Date.now(),
      userName: message.userName || socket.auth?.username || 'Unknown'
    };

    console.log('Broadcasting lobby message:', enrichedMessage);

    // Broadcast to all connected clients
    io.emit('lobby_chat_message', enrichedMessage);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', {
      socketId: socket.id,
      userId: socket.userId
    });

    if (socket.userId) {
      authenticatedSockets.delete(socket.userId);
      onlineUsers.delete(socket.userId);
      io.emit('online_users', Array.from(onlineUsers));
      console.log('User disconnected:', {
        userId: socket.userId,
        onlineUsers: Array.from(onlineUsers)
      });
    }
  });

  // Join game room for real-time updates
  socket.on('join_game', ({ gameId }) => {
    if (!socket.isAuthenticated || !socket.userId) {
      console.log('Unauthorized join_game attempt:', { 
        socketId: socket.id, 
        isAuthenticated: socket.isAuthenticated,
        userId: socket.userId 
      });
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    try {
      const game = games.find((g: Game) => g.id === gameId);
      if (!game) {
        console.log(`Game ${gameId} not found`);
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      // Check if user is already in the game
      const isPlayerInGame = game.players.some((player: GamePlayer | null) => 
        player && player.id === socket.userId
      );

      if (!isPlayerInGame) {
        // Find an empty seat
        const emptySeatIndex = game.players.findIndex((player: GamePlayer | null) => player === null);
        if (emptySeatIndex === -1) {
          console.log(`Game ${gameId} is full`);
          socket.emit('error', { message: 'Game is full' });
          return;
        }

        // Add player to the game
        game.players[emptySeatIndex] = {
          id: socket.userId,
          username: socket.auth?.username || 'Unknown',
          avatar: socket.auth?.avatar || '/default-avatar.png',
          type: 'human',
        };
      }

      // Join the game room
      socket.join(gameId);
      console.log(`User ${socket.userId} joined game ${gameId}`);
      // Emit confirmation to the client
      socket.emit('joined_game_room', { gameId });
      // Send game update ONLY to this socket, with hand
      socket.emit('game_update', enrichGameForClient(game, socket.userId));
      // Notify all clients about games update
      emitGameUpdateToPlayers(game);
      io.emit('games_updated', games);
    } catch (error) {
      console.error('Error in join_game:', error);
      socket.emit('error', { message: 'Internal server error' });
    }
  });

  // Leave game event
  socket.on('leave_game', ({ gameId, userId }) => {
    if (!socket.isAuthenticated || !socket.userId || socket.userId !== userId) {
      console.log('Unauthorized leave_game attempt');
      socket.emit('error', { message: 'Not authorized' });
      return;
    }

    try {
      const game = games.find((g: Game) => g.id === gameId);
      if (!game) {
        console.log(`Game ${gameId} not found`);
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      // Remove the player from the game
      const playerIdx = game.players.findIndex((p: GamePlayer | null) => p && p.id === userId);
      if (playerIdx !== -1) {
        game.players[playerIdx] = null;
        socket.leave(gameId);
        // Emit game_update to the game room for real-time sync
        emitGameUpdateToPlayers(game);
        io.emit('games_updated', games);
        console.log(`User ${userId} left game ${gameId}`);
      }

      // Remove the game if there are no human players left
      const hasHumanPlayers = game.players.some((p: GamePlayer | null) => p && p.type === 'human');
      if (!hasHumanPlayers) {
        const gameIdx = games.findIndex((g: Game) => g.id === gameId);
        if (gameIdx !== -1) {
          games.splice(gameIdx, 1);
          io.emit('games_updated', games);
          console.log(`Game ${gameId} removed (no human players left)`);
        }
      }
    } catch (error) {
      console.error('Error in leave_game:', error);
      socket.emit('error', { message: 'Internal server error' });
    }
  });

  // Start game event
  socket.on('start_game', async ({ gameId }) => {
    try {
      const game = games.find(g => g.id === gameId);
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      if (game.status !== 'WAITING') {
        socket.emit('error', { message: 'Game already started' });
        return;
      }
      // Only deduct coins if all 4 players are human
      const allHuman = game.players.length === 4 && game.players.every(p => p && p.type === 'human');
      if (allHuman) {
        try {
          for (const player of game.players) {
            if (player && player.type === 'human') {
              await prisma.user.update({
                where: { id: player.id },
                data: { coins: { decrement: game.buyIn } }
              });
            }
          }
        } catch (err) {
          socket.emit('error', { message: 'Failed to debit coins from players' });
          return;
        }
      }
      game.isBotGame = !allHuman;
      game.status = 'BIDDING';
      // Dealer assignment and card dealing
      const dealerIndex = assignDealer(game.players, game.dealerIndex);
      game.dealerIndex = dealerIndex;
      // Assign dealer chip/flag for UI
      game.players.forEach((p, i) => {
        if (p) p.isDealer = (i === dealerIndex);
      });
      const hands = dealCards(game.players, dealerIndex);
      game.hands = hands;
      // Bidding phase state
      const firstBidder = game.players[(dealerIndex + 1) % 4];
      if (!firstBidder) {
        throw new Error('Invalid game state: no first bidder found');
      }
      game.bidding = {
        currentPlayer: firstBidder.id,
        currentBidderIndex: (dealerIndex + 1) % 4,
        bids: [null, null, null, null],
        nilBids: {}
      };
      // Emit to all players
      io.emit('games_updated', games);
      io.to(game.id).emit('game_started', {
        dealerIndex,
        hands: hands.map((hand, i) => ({
          playerId: game.players[i]?.id,
          hand
        })),
        bidding: game.bidding,
      });
      // Emit game_update for client sync
      console.log('[DEBUG] Emitting game_update:', JSON.stringify(game, null, 2));
      emitGameUpdateToPlayers(game);
      // --- FIX: If first bidder is a bot, trigger bot bidding immediately ---
      if (firstBidder.type === 'bot') {
        console.log('[DEBUG] (SOCKET) About to call botMakeMove for seat', (dealerIndex + 1) % 4, 'bot:', firstBidder.username);
        botMakeMove(game, (dealerIndex + 1) % 4);
      }
    } catch (err) {
      console.error('Error in start_game handler:', err);
      socket.emit('error', { message: 'Failed to start game' });
    }
  });

  socket.on('make_bid', ({ gameId, userId, bid }) => {
    const game = games.find(g => g.id === gameId);
    if (!game || !game.bidding) return;
    const playerIndex = game.players.findIndex(p => p && p.id === userId);
    console.log('[BID DEBUG] make_bid received:', { gameId, userId, bid, playerIndex, currentBidderIndex: game.bidding.currentBidderIndex, bids: game.bidding.bids });
    if (playerIndex === -1) {
      console.log('[BID DEBUG] Bid rejected: player not found');
      return;
    }
    if (playerIndex !== game.bidding.currentBidderIndex) {
      console.log('[BID DEBUG] Bid rejected: not player turn', { playerIndex, currentBidderIndex: game.bidding.currentBidderIndex });
      return; // Not their turn
    }
    if (game.bidding.bids[playerIndex] !== null) {
      console.log('[BID DEBUG] Bid rejected: already bid', { playerIndex });
      return; // Already bid
    }
    // Store the bid
    game.bidding.bids[playerIndex] = bid;
    // Find next player who hasn't bid
    let next = (playerIndex + 1) % 4;
    while (game.bidding.bids[next] !== null && next !== playerIndex) {
      next = (next + 1) % 4;
    }
    if (game.bidding.bids.every(b => b !== null)) {
      // All bids in, move to play phase
      if (typeof game.dealerIndex !== 'number') {
        socket.emit('error', { message: 'Invalid game state: no dealer assigned' });
        return;
      }
      const idx = (game.dealerIndex + 1) % 4;
      if (game.players[idx] && game.players[idx]!.type === 'bot') {
        console.log('[BOT DEBUG] (SOCKET) About to call botPlayCard for seat', idx, 'bot:', game.players[idx]!.username);
        botPlayCard(game, idx);
      }
    } else {
      game.bidding.currentBidderIndex = next;
      game.bidding.currentPlayer = game.players[next]?.id ?? '';
      io.to(game.id).emit('bidding_update', {
        currentBidderIndex: next,
        bids: game.bidding.bids,
      });
      // If next is a bot, trigger their move
      if (game.players[next] && game.players[next].type === 'bot') {
        botMakeMove(game, next);
      }
    }
  });

  socket.on('play_card', ({ gameId, userId, card }) => {
    const game = games.find(g => g.id === gameId);
    if (!game || !game.play || !game.hands || !game.bidding) {
      socket.emit('error', { message: 'Invalid game state' });
      return;
    }
    const playerIndex = game.players.findIndex(p => p && p.id === userId);
    if (playerIndex === -1) {
      socket.emit('error', { message: 'Player not found in game' });
      return;
    }
    if (playerIndex !== game.play.currentPlayerIndex) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }
    // Validate card is in player's hand
    const hand = game.hands[playerIndex];
    if (!hand) {
      socket.emit('error', { message: 'Invalid hand state' });
      return;
    }
    const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (cardIndex === -1) {
      socket.emit('error', { message: 'Card not in hand' });
      return;
    }
    // Remove card from hand and add to current trick
    hand.splice(cardIndex, 1);
    game.play.currentTrick.push({ ...card, playerIndex });
    // If trick is complete (4 cards)
    if (game.play.currentTrick.length === 4) {
      // Determine winner of the trick
      const winnerIndex = determineTrickWinner(game.play.currentTrick);
      if (winnerIndex === undefined) {
        socket.emit('error', { message: 'Invalid trick state' });
        return;
      }
      game.play.tricks.push({
        cards: game.play.currentTrick,
        winnerIndex,
      });
      game.play.currentTrick = [];
      game.play.trickNumber += 1;
      game.play.currentPlayerIndex = winnerIndex;
      game.play.currentPlayer = game.players[winnerIndex]?.id ?? '';
      // Emit trick complete
      io.to(game.id).emit('trick_complete', {
        trick: game.play.tricks[game.play.tricks.length - 1],
        trickNumber: game.play.trickNumber,
      });
      emitGameUpdateToPlayers(game);
      // If all tricks played, move to hand summary/scoring
      if (game.play.trickNumber === 13) {
        // ... existing code ...
      } else {
        // If next player is a bot, trigger their move
        const nextPlayer = game.players[winnerIndex];
        if (nextPlayer && nextPlayer.type === 'bot') {
          console.log('[BOT DEBUG] (SOCKET) About to call botPlayCard for seat', winnerIndex, 'bot:', nextPlayer.username);
          botPlayCard(game, winnerIndex);
        }
      }
      return;
    } else {
      // Advance to next player
      game.play.currentPlayerIndex = (game.play.currentPlayerIndex + 1) % 4;
      game.play.currentPlayer = game.players[game.play.currentPlayerIndex]?.id ?? '';
      // If next player is a bot, trigger their move
      const nextPlayer = game.players[game.play.currentPlayerIndex];
      if (nextPlayer) {
        console.log('[BOT DEBUG] (SOCKET) About to call botPlayCard for seat', game.play.currentPlayerIndex, 'bot:', nextPlayer.username);
        botPlayCard(game, game.play.currentPlayerIndex);
      }
    }
    io.to(game.id).emit('play_update', {
      currentPlayerIndex: game.play.currentPlayerIndex,
      currentTrick: game.play.currentTrick,
      hands: game.hands.map((h, i) => ({
        playerId: game.players[i]?.id,
        handCount: h.length,
      })),
    });
    emitGameUpdateToPlayers(game);
  });
});

// Add error handling for the HTTP server
httpServer.on('error', (error: Error) => {
  console.error('HTTP Server Error:', error);
});

// Add error handling for Socket.IO
io.engine.on('connection_error', (err) => {
  console.error('Socket.IO Connection Error:', err);
});

// Add upgrade handling
io.engine.on('upgrade', (transport) => {
  console.log('Transport upgraded to:', transport.name);
});

io.engine.on('upgradeError', (err) => {
  console.error('Upgrade error:', err);
});

// Helper to enrich game object for client
function enrichGameForClient(game: Game, userId?: string): Game {
  if (!game) return game;
  const hands = game.hands || [];
  const dealerIndex = game.dealerIndex;

  // Patch: Always set top-level currentPlayer for frontend
  let currentPlayer: string | undefined = undefined;
  if (game.status === 'BIDDING' && game.bidding) {
    currentPlayer = game.bidding.currentPlayer ?? '';
  } else if (game.status === 'PLAYING' && game.play) {
    currentPlayer = game.play.currentPlayer ?? '';
  }

  return {
    ...game,
    currentPlayer, // Always present for frontend
    players: (game.players || []).map((p: GamePlayer | null, i: number) => {
      if (!p) return null;
      return {
        ...p,
        hand: userId && p.id === userId ? hands[i] || [] : undefined,
        isDealer: dealerIndex !== undefined ? i === dealerIndex : !!p.isDealer,
      };
    })
  };
}

// Helper to emit game update to all players with their own hands
function emitGameUpdateToPlayers(game: Game) {
  game.players.forEach((player) => {
    if (player && player.id) {
      const playerSocket = authenticatedSockets.get(player.id);
      if (playerSocket) {
        playerSocket.emit('game_update', enrichGameForClient(game, player.id));
      }
    }
  });
}

const PORT = Number(process.env.PORT) || 3000;

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  console.log('Server configuration:', {
    port: PORT,
    env: process.env.NODE_ENV,
    cors: {
      allowedOrigins,
      credentials: true
    },
    socket: {
      path: '/socket.io',
      transports: ['polling', 'websocket']
    }
  });
}); 