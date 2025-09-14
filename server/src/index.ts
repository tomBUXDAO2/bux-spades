import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import passport from 'passport';
import session from 'express-session';

import jwt from 'jsonwebtoken';
import prisma from './lib/prisma';
import { games, seatReplacements, disconnectTimeouts, turnTimeouts } from './gamesStore';
import { syncDiscordUserData } from './lib/discordSync';
import { restoreAllActiveGames, startGameStateAutoSave, checkForStuckGames } from './lib/gameStatePersistence';
import { gameCleanupManager } from './lib/gameCleanup';
import { GameValidator } from './lib/gameValidator';
import { GameErrorHandler } from './lib/gameErrorHandler';
import type { Game, GamePlayer, Card, Suit, Rank } from './types/game';
import authRoutes from './routes/auth.routes';
import discordRoutes from './routes/discord.routes';
import gamesRoutes from './routes/games.routes';
import usersRoutes from './routes/users.routes';
import socialRoutes from './routes/social.routes';
import './config/passport';

// Import our new modular functions
import { 
  handleJoinGame, 
  handleMakeBid, 
  handlePlayCard,
  startTurnTimeout,
  clearTurnTimeout,
  clearAllTimeoutsForGame,
  handleGameChatMessage,
  handleLobbyChatMessage
} from './modules';

// EMERGENCY GLOBAL ERROR HANDLER - Prevent games from being lost
process.on('uncaughtException', (error) => {
  console.error('[EMERGENCY] Uncaught Exception:', error);
  console.error('[EMERGENCY] Games in memory:', games.length);
  games.forEach((game, i) => {
    console.error(`[EMERGENCY] Game ${i}: ${game.id}, status: ${game.status}, players: ${game.players.filter(p => p).length}`);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[EMERGENCY] Unhandled Rejection at:', promise, 'reason:', reason);
  console.error('[EMERGENCY] Games in memory:', games.length);
  games.forEach((game, i) => {
    console.error(`[EMERGENCY] Game ${i}: ${game.id}, status: ${game.status}, players: ${game.players.filter(p => p).length}`);
  });
});

// Import Discord bot (only if bot token is provided and valid)
let discordBot: any = null;
if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_BOT_TOKEN.trim() !== '') {
  try {
    const token = process.env.DISCORD_BOT_TOKEN.trim();
    if (token && token.length > 0) {
      discordBot = require('./discord-bot/bot').default;
      console.log('Discord bot loaded successfully');
    } else {
      console.warn('Discord bot token is empty, skipping bot initialization');
    }
  } catch (error) {
    console.warn('Discord bot not loaded:', error);
  }
} else {
  console.log('Discord bot token not provided, skipping bot initialization');
}

const app = express();
const httpServer = createServer(app);

// CORS configuration
const httpAllowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://bux-spades.vercel.app',
  'https://bux-spades-git-main-tombuxdao.vercel.app'
];

const io = new Server(httpServer, {
  cors: {
    origin: httpAllowedOrigins,
    credentials: true
  },
  path: '/socket.io',
  transports: ['polling', 'websocket']
});

// Body parsing middleware MUST come first
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use(cors({
  origin: httpAllowedOrigins,
  credentials: true
}));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Global state
export const authenticatedSockets = new Map<string, AuthenticatedSocket>();
const onlineUsers = new Set<string>();

// Session management
const userSessions = new Map<string, string>(); // userId -> sessionId
const sessionToUser = new Map<string, string>(); // sessionId -> userId

// Inactivity tracking
const tableInactivityTimers = new Map<string, NodeJS.Timeout>();
const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes in milliseconds

// Export io for use in routes
export { io, onlineUsers };

// Passport middleware (for Discord OAuth2 only)
app.use(passport.initialize());

// Debug middleware to log requests
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`, req.body);
    next();
  });
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', discordRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/social', socialRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    games: games.length,
    onlineUsers: onlineUsers.size
  });
});

// Socket.IO authentication middleware
io.use(async (socket: Socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('No token provided'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as any;
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, username: true, avatar: true, discordId: true }
    });

    if (!user) {
      return next(new Error('User not found'));
    }

    // Attach user info to socket
    (socket as AuthenticatedSocket).userId = user.id;
    (socket as AuthenticatedSocket).isAuthenticated = true;
    (socket as AuthenticatedSocket).auth = { user };

    next();
  } catch (error) {
    console.error('Socket authentication error:', error);
    next(new Error('Authentication failed'));
  }
});

// Socket.IO connection handling
io.on('connection', (socket: AuthenticatedSocket) => {
  console.log('[CONNECTION] New socket connection:', {
    socketId: socket.id,
    userId: socket.userId,
    isAuthenticated: socket.isAuthenticated,
    auth: socket.auth
  });

  if (socket.userId) {
    // Check if there's an existing socket for this user and disconnect it
    const existingSocket = authenticatedSockets.get(socket.userId);
    if (existingSocket && existingSocket.id !== socket.id) {
      console.log(`[CONNECTION] Disconnecting existing socket for user ${socket.userId}:`, {
        oldSocketId: existingSocket.id,
        newSocketId: socket.id
      });
      existingSocket.emit('session_invalidated', {
        reason: 'new_connection',
        message: 'You have connected from another location'
      });
      existingSocket.disconnect();
    }
    
    // Create new session for this user
    const sessionId = createUserSession(socket.userId);
    
    authenticatedSockets.set(socket.userId, socket);
    onlineUsers.add(socket.userId);
    io.emit('online_users', Array.from(onlineUsers));
    
    console.log('User connected:', {
      userId: socket.userId,
      sessionId,
      socketId: socket.id,
      onlineUsers: Array.from(onlineUsers)
    });
    
    socket.emit('authenticated', { 
      success: true, 
      userId: socket.userId,
      sessionId,
      games: Array.from(socket.rooms).filter(room => room !== socket.id)
    });

    // Auto-join any rooms for games this user is already part of
    games.forEach(game => {
      const isPlayerInGame = game.players.some(player => player && player.id === socket.userId);
      if (isPlayerInGame) {
        socket.join(game.id);
        console.log(`[CONNECTION] Auto-joined game room ${game.id} for user ${socket.userId}`);
      }
    });
  }

  // Socket event handlers using our modular functions
  socket.on('join_game', (data) => handleJoinGame(socket, data));
  socket.on('make_bid', (data) => handleMakeBid(socket, data));
  socket.on('play_card', (data) => handlePlayCard(socket, data));

  // Chat handlers using modular functions
  socket.on('chat_message', async ({ gameId, message }) => {
    await handleGameChatMessage(socket, gameId, message);
  });

  // Disconnect handling

  // Lobby chat handler
  socket.on("lobby_chat_message", async (message) => {
    await handleLobbyChatMessage(socket, message);
  });
  socket.on('disconnect', (reason) => {
    console.log('[DISCONNECT] User disconnected:', {
      userId: socket.userId,
      socketId: socket.id,
      reason
    });

    if (socket.userId) {
      authenticatedSockets.delete(socket.userId);
      onlineUsers.delete(socket.userId);
      io.emit('online_users', Array.from(onlineUsers));
    }
  });
});

// Helper functions
function createUserSession(userId: string): string {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  userSessions.set(userId, sessionId);
  sessionToUser.set(sessionId, userId);
  return sessionId;
}

function updateGameActivity(gameId: string): void {
  const game = games.find(g => g.id === gameId);
  if (game) {
    game.lastActivity = Date.now();
  }
}

// Export functions for use in modules
export { startTurnTimeout, clearTurnTimeout, clearAllTimeoutsForGame };

// Type definitions
export interface AuthenticatedSocket extends Socket {
  userId?: string;
  isAuthenticated?: boolean;
  auth?: { user: any };
}

const PORT = Number(process.env.PORT) || 3000;

httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server is running on port ${PORT}`);
  console.log('Server configuration:', {
    port: PORT,
    env: process.env.NODE_ENV,
    cors: {
      allowedOrigins: httpAllowedOrigins,
      credentials: true
    },
    socket: {
      path: '/socket.io',
      transports: ['polling', 'websocket']
    }
  });
  
  // Restore active games from database after server restart
  console.log('🔄 Server restarted - restoring active games from database...');
  try {
    const restoredGames = await restoreAllActiveGames();
    restoredGames.forEach(game => {
      games.push(game);
      console.log(`✅ Restored game ${game.id} - Round ${game.currentRound}, Trick ${game.currentTrick}`);
    });
    console.log(`✅ Restored ${restoredGames.length} active games`);
  } catch (error) {
    console.error('❌ Failed to restore active games:', error);
  }
  
  // Start auto-saving game state
  startGameStateAutoSave(games);
  console.log('💾 Game state auto-save enabled (every 30 seconds)');
  
  // Start stuck game checker
  setInterval(() => {
    checkForStuckGames();
  }, 60000); // Check every minute
  console.log('🔍 Stuck game checker enabled (every minute)');
  
  // Start comprehensive game cleanup system
  gameCleanupManager.startCleanup(games);
  console.log('🧹 Game cleanup system enabled (every 30 seconds)');
});

// Helper function to get validated games for lobby
function getValidatedGames(): Game[] {
  const { validGames } = GameValidator.validateAllGames(games);
  return validGames;
}
