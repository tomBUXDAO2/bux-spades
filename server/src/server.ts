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
import type { Game, GamePlayer, Card, Suit, Rank } from './types/game';
import authRoutes from './routes/auth.routes';
import discordRoutes from './routes/discord.routes';
import gamesRoutes, { assignDealer, dealCards, botMakeMove, botPlayCard, determineTrickWinner, calculateSoloHandScore } from './routes/games.routes';
import usersRoutes from './routes/users.routes';
import socialRoutes from './routes/social.routes';
import './config/passport';
import { enrichGameForClient } from './routes/games.routes';
import { logGameStart } from './routes/games.routes';

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
    // Validate token format before loading bot
    const token = process.env.DISCORD_BOT_TOKEN.trim();
    if (token && token.length > 0) {
      console.log('🤖 Loading Discord bot...');
      discordBot = require('./discord-bot/bot').default;
      console.log('✅ Discord bot loaded successfully');
    }
  } catch (error) {
    console.error('❌ Failed to load Discord bot:', error);
    discordBot = null;
  }
} else {
  console.log('⚠️  Discord bot token not provided, skipping bot initialization');
}

// Create Express app
const app = express();
const httpServer = createServer(app);

// CORS configuration
const httpAllowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://bux-spades.vercel.app',
  'https://bux-spades-git-main-tombuxdao2s-projects.vercel.app',
  'https://bux-spades-2-0.vercel.app',
  'https://www.bux-spades.pro'
];

app.use(cors({
  origin: httpAllowedOrigins,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Socket.IO configuration
const io = new Server(httpServer, {
  cors: {
    origin: httpAllowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
  path: '/socket.io',
  transports: ['polling', 'websocket']
});

// Socket.IO connection validation
io.engine.on('connection_error', (err) => {
  console.error('Socket.IO connection error:', err);
});

// Socket.IO connection validation
io.use((socket, next) => {
  const origin = socket.handshake.headers.origin;
  if (httpAllowedOrigins.includes(origin || '')) {
    next();
  } else {
    console.error('CORS error: Origin not allowed:', origin);
    next(new Error('CORS error: Origin not allowed'));
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

// Global state
const authenticatedSockets = new Map<string, AuthenticatedSocket>();
const onlineUsers = new Set<string>();

// Session management
const userSessions = new Map<string, string>(); // userId -> sessionId
const sessionToUser = new Map<string, string>(); // sessionId -> userId

// Inactivity tracking
const tableInactivityTimers = new Map<string, NodeJS.Timeout>();
const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes in milliseconds

// Play again management
const playAgainTimers = new Map<string, { gameId: string, timer: NodeJS.Timeout, expiresAt: number }>();
const playAgainResponses = new Map<string, Set<string>>(); // gameId -> Set of player IDs who responded
const originalPlayers = new Map<string, string[]>(); // gameId -> Array of original player IDs when play again started

function startSeatReplacement(game: Game, seatIndex: number) {
  console.log(`[SEAT REPLACEMENT DEBUG] Starting replacement for seat ${seatIndex} in game ${game.id}`);
  console.log(`[SEAT REPLACEMENT DEBUG] Current players:`, game.players.map((p, i) => `${i}: ${p ? `${p.username} (${p.type})` : 'null'}`));
  console.log(`[SEAT REPLACEMENT DEBUG] Seat ${seatIndex} value:`, game.players[seatIndex]);
  
  // Check if seat is actually empty
  if (game.players[seatIndex]) {
    console.log(`[SEAT REPLACEMENT DEBUG] Seat ${seatIndex} is not empty, aborting replacement`);
    return;
  }
  
  // ... rest of the function implementation
}

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

// Add this at the end, after all routes
// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    message: err.message || 'Something went wrong!',
  });
});

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
});

export { app, httpServer, io, authenticatedSockets, onlineUsers, playAgainTimers, playAgainResponses, originalPlayers, startSeatReplacement };
