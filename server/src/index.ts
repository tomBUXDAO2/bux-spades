import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import passport from 'passport';
import session from 'express-session';
import jwt from 'jsonwebtoken';

import authRoutes from './routes/auth.routes';
import discordRoutes from './routes/discord.routes';
import gamesRoutes, { games } from './routes/games.routes';
import usersRoutes from './routes/users.routes';
import socialRoutes from './routes/social.routes';
import './config/passport';
import type { Game, GamePlayer } from './types/game';

const app = express();
const httpServer = createServer(app);

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
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  },
  upgradeTimeout: 30000,
  maxHttpBufferSize: 1e8,
  perMessageDeflate: {
    threshold: 2048
  }
});

// Extend Socket type to allow userId property
interface AuthenticatedSocket extends Socket {
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
io.on('connection', (socket: AuthenticatedSocket) => {
  console.log('Client connected:', socket.id);
  socket.isAuthenticated = false;

  // Check initial auth data
  const auth = socket.handshake.auth;
  if (auth?.userId && auth?.token) {
    try {
      const decoded = jwt.verify(auth.token, process.env.JWT_SECRET!);
      if (typeof decoded === 'object' && decoded.userId === auth.userId) {
        socket.userId = auth.userId;
        socket.auth = auth;
        authenticatedSockets.set(auth.userId, socket);
        socket.isAuthenticated = true;
        onlineUsers.add(auth.userId);
        io.emit('online_users', Array.from(onlineUsers));
        console.log('User auto-authenticated:', auth.userId);
        socket.emit('authenticated', { 
          success: true, 
          userId: auth.userId,
          games: Array.from(socket.rooms).filter(room => room !== socket.id)
        });
      } else {
        console.log('JWT userId mismatch');
        socket.disconnect(true);
        return;
      }
    } catch (err) {
      console.log('JWT verification failed:', err);
      socket.disconnect(true);
      return;
    }
  } else {
    console.log('No auth or token in handshake');
    socket.disconnect(true);
    return;
  }

  // Listen for authenticate event from client
  socket.on('authenticate', ({ userId, token }) => {
    console.log('Authentication attempt:', { userId, hasToken: !!token });
    if (!userId || !token) {
      console.log('Authentication failed: No userId or token provided');
      socket.emit('error', { message: 'No userId or token provided' });
      return;
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!);
      if (typeof decoded === 'object' && decoded.userId === userId) {
        authenticatedSockets.set(userId, socket);
        socket.userId = userId;
        socket.isAuthenticated = true;
        onlineUsers.add(userId);
        io.emit('online_users', Array.from(onlineUsers));
        console.log('User authenticated:', userId);
        socket.emit('authenticated', { 
          success: true, 
          userId,
          games: Array.from(socket.rooms).filter(room => room !== socket.id)
        });
        // Join any existing games for this user
        const userGames = games.filter((game: Game) => 
          game.players.some((player: GamePlayer | null) => player?.id === userId)
        );
        userGames.forEach((game: Game) => {
          socket.join(game.id);
          console.log(`User ${userId} joined existing game ${game.id}`);
          socket.emit('game_update', game);
        });
      } else {
        console.log('JWT userId mismatch in authenticate');
        socket.emit('error', { message: 'Invalid token' });
        socket.disconnect(true);
      }
    } catch (err) {
      console.log('JWT verification failed in authenticate:', err);
      socket.emit('error', { message: 'Invalid or expired token' });
      socket.disconnect(true);
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
          avatar: socket.auth?.avatar || '/default-avatar.png'
        };
      }

      // Join the game room
      socket.join(gameId);
      console.log(`User ${socket.userId} joined game ${gameId}`);
      
      // Broadcast game update to all players in the room
      io.to(gameId).emit('game_update', game);
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
        io.to(gameId).emit('game_update', game);
        io.emit('games_updated', games);
        console.log(`User ${userId} left game ${gameId}`);
      }

      // If all players are null, remove the game
      if (game.players.every((p: GamePlayer | null) => p === null)) {
        const gameIdx = games.findIndex((g: Game) => g.id === gameId);
        if (gameIdx !== -1) {
          games.splice(gameIdx, 1);
          io.emit('games_updated', games);
          console.log(`Game ${gameId} removed (no players left)`);
        }
      }
    } catch (error) {
      console.error('Error in leave_game:', error);
      socket.emit('error', { message: 'Internal server error' });
    }
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
              io.to(game.id).emit('game_update', game);
              io.emit('games_updated', games);
              console.log(`User ${socket.userId} removed from game ${game.id} due to disconnect`);
            }
          }, 30000); // 30 second grace period
        }
      });

      // Remove any games that are now empty after the grace period
      setTimeout(() => {
        for (let i = games.length - 1; i >= 0; i--) {
          if (games[i].players.every((p: GamePlayer | null) => p === null)) {
            console.log(`Game ${games[i].id} removed (no players left after disconnect)`);
            games.splice(i, 1);
            io.emit('games_updated', games);
          }
        }
      }, 30000);
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

const PORT = Number(process.env.PORT) || 3000;

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
}); 