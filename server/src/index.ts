import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import passport from 'passport';
import session from 'express-session';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

import authRoutes from './routes/auth.routes';
import discordRoutes from './routes/discord.routes';
import gamesRoutes, { games, assignDealer, dealCards } from './routes/games.routes';
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
  cookie: {
    name: 'io',
    path: '/',
    httpOnly: true,
    sameSite: 'none',
    secure: true
  },
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

    if (decoded.userId === auth.userId) {
      socket.userId = auth.userId;
      socket.auth = { ...auth, token };
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
      // Broadcast game update to all players in the room
      io.to(gameId).emit('game_update', enrichGameForClient(game));
      // Notify all clients about games update
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
        io.to(gameId).emit('game_update', enrichGameForClient(game));
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
      const dealerIndex = assignDealer(game.players);
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
      io.to(game.id).emit('game_update', enrichGameForClient(game));
      io.to(socket.id).emit('game_update', enrichGameForClient(game));
    } catch (err) {
      console.error('Error in start_game handler:', err);
      socket.emit('error', { message: 'Failed to start game' });
    }
  });

  // Broadcast chat messages to all clients in the game room
  socket.on('chat_message', ({ gameId, message }) => {
    console.log('[SERVER] chat_message received:', JSON.stringify({ gameId, message }));
    console.log('[SERVER] Broadcasting chat_message to room:', gameId, 'Message:', message);
    io.to(gameId).emit('chat_message', { gameId, message });
  });

  socket.on('disconnect', (reason) => {
    console.log('Client disconnected:', socket.id, 'Reason:', reason);
    
    if (socket.userId) {
      // Clean up user data
      authenticatedSockets.delete(socket.userId);
      onlineUsers.delete(socket.userId);
      io.emit('online_users', Array.from(onlineUsers));
      console.log('User disconnected:', socket.userId);

      // Handle game cleanup for disconnected user
      games.forEach((game: Game) => {
        const playerIdx = game.players.findIndex((p: GamePlayer | null) => p && p.id === socket.userId);
        if (playerIdx !== -1) {
          // Don't immediately remove the player, wait for a grace period
          setTimeout(() => {
            // Check if the user has reconnected
            if (!authenticatedSockets.has(socket.userId!)) {
              game.players[playerIdx] = null;
              io.to(game.id).emit('game_update', enrichGameForClient(game));
              io.emit('games_updated', games);
              console.log(`User ${socket.userId} removed from game ${game.id} due to disconnect`);

              // Check if there are any human players left
              const hasHumanPlayers = game.players.some((p: GamePlayer | null) => p && p.type === 'human');
              
              // If no human players remain, remove the game
              if (!hasHumanPlayers) {
                const gameIdx = games.findIndex((g: Game) => g.id === game.id);
                if (gameIdx !== -1) {
                  games.splice(gameIdx, 1);
                  io.emit('games_updated', games);
                  console.log(`Game ${game.id} removed (no human players left after disconnect)`);
                }
              }
            }
          }, 30000); // 30 second grace period
        }
      });
    }
  });

  // Real-time lobby chat: broadcast messages to all clients except sender
  socket.on('lobby_chat_message', (msg) => {
    if (!socket.isAuthenticated || !socket.userId) {
      console.log('Unauthorized chat message attempt');
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }
    socket.broadcast.emit('lobby_chat_message', msg);
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    message: err.message || 'Something went wrong!',
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
function enrichGameForClient(game: Game): Game {
  if (!game) return game;
  const hands = game.hands || [];
  const dealerIndex = game.dealerIndex;
  return {
    ...game,
    players: (game.players || []).map((p: GamePlayer | null, i: number) => {
      if (!p) return null;
      return {
        ...p,
        hand: hands[i] || [],
        isDealer: dealerIndex !== undefined ? i === dealerIndex : !!p.isDealer,
      };
    })
  };
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