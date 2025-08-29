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
import type { Game, GamePlayer, Card, Suit, Rank } from './types/game';
import authRoutes from './routes/auth.routes';
import discordRoutes from './routes/discord.routes';
import gamesRoutes, { assignDealer, dealCards, botMakeMove, botPlayCard, determineTrickWinner, calculateSoloHandScore } from './routes/games.routes';
import usersRoutes from './routes/users.routes';
import socialRoutes from './routes/social.routes';
import './config/passport';
import { enrichGameForClient } from './routes/games.routes';
import { logGameStart } from './routes/games.routes';
import { trickLogger } from './lib/trickLogger';

// Import Discord bot (only if bot token is provided and valid)
let discordBot: any = null;
if (process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_BOT_TOKEN.trim() !== '') {
  try {
    // Validate token format before loading bot
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


// Body parsing middleware MUST come first
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware for OAuth flows
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize Passport and restore authentication state
app.use(passport.initialize());
app.use(passport.session());

// Strict CORS handler
const httpAllowedOrigins = [
  'http://localhost:5173',
  'https://bux-spades.pro',
  'https://www.bux-spades.pro',
  'https://bux-spades.vercel.app'
];
app.use(cors({
  origin(origin, callback) {
    if (!origin || httpAllowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Set-Cookie']
}));

const socketAllowedOrigins = [
  'http://localhost:5173',
  'https://bux-spades.pro',
  'https://www.bux-spades.pro',
  'https://bux-spades.vercel.app'
];

// Socket.IO setup
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || socketAllowedOrigins.includes(origin)) {
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
  pingTimeout: 120000, // Increased from 60000 - 2 minutes for mobile stability
  pingInterval: 30000, // Increased from 25000 - 30 seconds for better mobile handling
  connectTimeout: 60000, // Increased from 45000 - 1 minute for slower connections
  allowUpgrades: true,
  cookie: process.env.NODE_ENV === 'production' ? {
    name: 'io',
    path: '/',
    httpOnly: true,
    sameSite: 'none',
    secure: true
  } : false,
  upgradeTimeout: 45000, // Increased from 30000 - 45 seconds for mobile
  maxHttpBufferSize: 1e6,
  perMessageDeflate: {
    threshold: 2048
  },
  // Add mobile-specific optimizations
  allowRequest: (req, callback) => {
    // Allow all connections for now, can be restricted later
    callback(null, true);
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



// Add this at the end, after all routes
// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    message: err.message || 'Something went wrong!',
  });
});

// Socket.IO connection handling
io.use(async (socket: AuthenticatedSocket, next) => {
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
      // Sync Discord data before setting socket auth
      let finalUsername = auth.username || (typeof auth.userId === 'object' && auth.userId.user ? auth.userId.user.username : undefined);
      let finalAvatar = auth.avatar || (typeof auth.userId === 'object' && auth.userId.user ? auth.userId.user.avatar : undefined);
      
      try {
        const syncedData = await syncDiscordUserData(authUserId);
        if (syncedData) {
          finalUsername = syncedData.username;
          finalAvatar = syncedData.avatar;
          console.log(`[SOCKET AUTH] Synced Discord data for ${authUserId}:`, {
            oldUsername: auth.username,
            newUsername: finalUsername,
            oldAvatar: auth.avatar,
            newAvatar: finalAvatar
          });
        }
      } catch (error) {
        console.error(`[SOCKET AUTH] Failed to sync Discord data for ${authUserId}:`, error);
      }
      
      socket.userId = authUserId;
      socket.auth = { 
        ...auth, 
        token,
        userId: authUserId,
        username: finalUsername,
        avatar: finalAvatar
      };
      
      console.log('Socket auth debug:', {
        authUsername: auth.username,
        authAvatar: auth.avatar,
        authUserIdType: typeof auth.userId,
        authUserIdUser: typeof auth.userId === 'object' ? auth.userId.user : null,
        finalUsername: socket.auth.username,
        finalAvatar: socket.auth.avatar
      });
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

    // Auto-join any rooms for games this user is already part of (players or spectators)
    try {
      const userGameIds = games
        .filter((g: any) => (g.players || []).some((p: any) => p && p.id === socket.userId) || (g.spectators || []).some((s: any) => s && s.id === socket.userId))
        .map((g: any) => g.id);
      if (userGameIds.length > 0) {
        userGameIds.forEach((id: string) => socket.join(id));
        console.log('[AUTO JOIN ROOMS] userId:', socket.userId, 'rooms:', userGameIds);
        userGameIds.forEach((id: string) => socket.emit('joined_game_room', { gameId: id }));
      }
    } catch (e) {
      console.log('[AUTO JOIN ROOMS] error', e);
    }
  }

  // Handle chat messages
  socket.on('chat_message', async ({ gameId, message }) => {
    console.log('=== CHAT MESSAGE EVENT RECEIVED ===');
    console.log('Chat message received:', { gameId, message, socketId: socket.id, userId: socket.userId });

    // Basic size/rate checks
    if (!socket.data) socket.data = {} as any;
    const now = Date.now();
    // Simple in-memory token bucket per socket
    const bucket = (socket.data as any).chatBucket || { tokens: 5, lastRefill: now };
    const elapsed = now - bucket.lastRefill;
    const refill = Math.floor(elapsed / 1000) * 2; // 2 tokens/sec
    bucket.tokens = Math.min(20, bucket.tokens + refill);
    bucket.lastRefill = now;
    if (bucket.tokens <= 0) {
      return; // drop silently
    }
    bucket.tokens -= 1;
    (socket.data as any).chatBucket = bucket;

    if (typeof message?.message !== 'string' || message.message.length === 0 || message.message.length > 500) {
      return;
    }

    // Update game activity
    const game = games.find((g: Game) => g.id === gameId);
    if (game) {
      game.lastActivity = Date.now();
      updateGameActivity(gameId);
    }

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

    // Preserve system messages; otherwise force userId from socket
    if (message.userId !== 'system') {
      message.userId = socket.userId;
    }

    // Validate message format
    if (!message.userId || !message.message) {
      console.log('Invalid message format:', message);
      return;
    }

    // Find the game and get the player's username from the game state
    let userName = 'Unknown';
    
    console.log('Chat message debug:', {
      gameId,
      messageUserId: message.userId,
      gameFound: !!game,
      allGames: games.map(g => ({ id: g.id, status: g.status })),
      gamePlayers: game?.players?.map(p => p ? { id: p.id, username: p.username, name: (p as any).name } : null)
    });
    
    if (message.userId === 'system') {
      userName = 'System';
    } else if (game) {
      // First check if user is a player
      const player = game.players.find((p: GamePlayer | null) => p && p.id === message.userId);
      // Then check if user is a spectator
      const spectator = game.spectators?.find((s: any) => s && s.id === message.userId);
      
      console.log('Player/Spectator lookup debug:', {
        messageUserId: message.userId,
        playerFound: !!player,
        spectatorFound: !!spectator,
        player: player ? { id: player.id, username: player.username, name: (player as any).name } : null,
        spectator: spectator ? { id: spectator.id, username: spectator.username, name: (spectator as any).name } : null
      });
      
      if (player) {
        userName = player.username || (player as any).name || 'Unknown';
        console.log('Username resolved from player:', userName);
      } else if (spectator) {
        userName = spectator.username || (spectator as any).name || 'Unknown';
        console.log('Username resolved from spectator:', userName);
      } else {
        // Fallback to socket auth if user not found in game
        userName = socket.auth?.username || 'Unknown';
        console.log('Fallback to socket auth:', userName);
      }
    } else {
      // Fallback to socket auth if game not found
      userName = socket.auth?.username || 'Unknown';
      console.log('Game not found, fallback to socket auth:', userName);
    }

    // Add timestamp and ID if not present
    const enrichedMessage = {
      ...message,
      id: message.id || `${message.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: message.timestamp || Date.now(),
      userName: userName // Always use the resolved userName, not the client-provided one
    };

    console.log('Broadcasting chat message:', {
      gameId,
      message: enrichedMessage,
      room: socket.rooms.has(gameId)
    });

    // Get all sockets in the game room for debugging
    const roomSockets = await io.in(gameId).fetchSockets();
    console.log(`Game ${gameId} room has ${roomSockets.length} sockets:`, roomSockets.map(s => ({ id: s.id, userId: (s as any).userId })));

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

    // Get username from socket auth (for lobby messages, we use the authenticated user's info)
    const userName = message.userName || socket.auth?.username || 'Unknown';

    // Add timestamp and ID if not present
    const enrichedMessage = {
      ...message,
      id: message.id || `${message.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: message.timestamp || Date.now(),
      userName: userName
    };

    console.log('Broadcasting lobby message:', enrichedMessage);

    // Broadcast to all connected clients
    io.emit('lobby_chat_message', enrichedMessage);
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log('Client disconnected:', {
      socketId: socket.id,
      userId: socket.userId,
      reason
    });

    if (socket.userId) {
      // Only remove from authenticatedSockets if this is the current socket for this user
      const currentSocket = authenticatedSockets.get(socket.userId);
      if (currentSocket && currentSocket.id === socket.id) {
        authenticatedSockets.delete(socket.userId);
        onlineUsers.delete(socket.userId);
        console.log('User disconnected (removed from tracking):', {
          userId: socket.userId,
          reason,
          onlineUsers: Array.from(onlineUsers)
        });
      } else {
        console.log('User disconnected (socket already replaced):', {
          userId: socket.userId,
          reason,
          currentSocketId: currentSocket?.id
        });
      }
      
      // Don't invalidate session on disconnect - let it persist for reconnection
      io.emit('online_users', Array.from(onlineUsers));
    }
  });

  // Join game room for real-time updates
  socket.on('join_game', async ({ gameId }) => {
    console.log('[SERVER DEBUG] join_game event received:', { 
      gameId, 
      socketId: socket.id, 
      userId: socket.userId,
      isAuthenticated: socket.isAuthenticated,
      timestamp: new Date().toISOString()
    });
    
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
      console.log('[JOIN GAME DEBUG] Looking for game:', gameId);
      console.log('[JOIN GAME DEBUG] Available games:', games.map(g => ({ id: g.id, status: g.status, players: g.players.map(p => p ? p.id : 'null') })));
      
      const game = games.find((g: Game) => g.id === gameId);
      if (!game) {
        console.log(`Game ${gameId} not found`);
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      
      // Update game activity
      game.lastActivity = Date.now();
      updateGameActivity(gameId);
      
      console.log('[SERVER DEBUG] Found game:', { 
        gameId, 
        status: game.status, 
        currentPlayer: game.currentPlayer,
        biddingCurrentPlayer: game.bidding?.currentPlayer,
        playCurrentPlayer: game.play?.currentPlayer
      });

      // Check if user is already in the game
      const isPlayerInGame = game.players.some((player: GamePlayer | null, _i: number) => 
        player && player.id === socket.userId
      );

      console.log(`[JOIN GAME DEBUG] User ${socket.userId} join check:`, {
        isPlayerInGame,
        gameCurrentPlayer: game.currentPlayer,
        gameStatus: game.status,
        players: game.players.map((p: GamePlayer | null, i: number) => `${i}: ${p ? p.id : 'null'}`)
      });

      if (!isPlayerInGame) {
        // Check if this user is the current player (they were removed but game state wasn't updated)
        const isCurrentPlayer = game.currentPlayer === socket.userId;
        
        if (isCurrentPlayer) {
          // User is the current player but not in a seat - find their original seat
          console.log(`[RECONNECT] Restoring current player ${socket.userId} to their original seat`);
          
          // Find which seat this player originally occupied by checking game state
          let originalSeatIndex = -1;
          for (let i = 0; i < game.players.length; i++) {
            if (game.players[i] && game.players[i].id === socket.userId) {
              originalSeatIndex = i;
              break;
            }
          }
          
          // If we can't find their original seat, put them in the first available seat
          if (originalSeatIndex === -1) {
            originalSeatIndex = game.players.findIndex(p => p === null);
            if (originalSeatIndex === -1) {
              console.log(`[RECONNECT] No available seats for reconnecting player ${socket.userId}`);
              socket.emit('error', { message: 'No available seats' });
              return;
            }
          }
          
          const playerAvatar = socket.auth?.avatar || '/default-avatar.png';
          const playerUsername = socket.auth?.username || 'Unknown';
          
          // Remove any existing player/bot from this seat and put the current player back
          const existingPlayer = game.players[originalSeatIndex];
          if (existingPlayer) {
            console.log(`[RECONNECT] Removing existing player from seat ${originalSeatIndex}:`, existingPlayer);
          }
          
          game.players[originalSeatIndex] = {
            id: socket.userId,
            username: playerUsername,
            avatar: playerAvatar,
            type: 'human',
            position: originalSeatIndex
          };
          
          // Create GamePlayer record in database for score tracking (if it doesn't exist)
          try {
            const existingGamePlayer = await prisma.gamePlayer.findFirst({
              where: {
                gameId: game.dbGameId || game.id,
                userId: socket.userId
              }
            });
            
            if (!existingGamePlayer) {
              if (game.dbGameId) {
                await prisma.gamePlayer.create({
                  data: {
                    gameId: game.dbGameId,
                    userId: socket.userId,
                    position: originalSeatIndex,
                    team: game.gameMode === 'PARTNERS' ? (originalSeatIndex === 0 || originalSeatIndex === 2 ? 1 : 2) : null,
                    bid: null,
                    bags: 0,
                    points: 0,
                    username: playerUsername,
                    discordId: null
                  }
                });
                console.log('[RECONNECT DEBUG] Created GamePlayer record for reconnected player:', socket.userId, 'in game:', game.dbGameId);
              } else {
                console.log('[RECONNECT DEBUG] No dbGameId available for GamePlayer creation');
              }
            } else {
              console.log('[RECONNECT DEBUG] GamePlayer record already exists for reconnected player:', socket.userId);
            }
          } catch (error) {
            console.error('[RECONNECT DEBUG] Failed to create GamePlayer record:', error);
            // Don't fail the reconnect if GamePlayer creation fails
          }
          
          // Remove player from spectators if they were added there during disconnect
          const spectatorIndex = game.spectators?.findIndex(s => s.id === socket.userId);
          if (spectatorIndex !== -1) {
            console.log(`[RECONNECT] Removing ${socket.userId} from spectators as they reconnected to their seat`);
            game.spectators.splice(spectatorIndex, 1);
          }
          
          console.log(`[RECONNECT] Player restored to seat ${originalSeatIndex}:`, game.players[originalSeatIndex]);
          console.log(`[RECONNECT] Game players after restoration:`, game.players.map((p: GamePlayer | null, i: number) => `${i}: ${p ? p.id : 'null'}`));
          
          // Clear any existing seat replacement for this seat
          const replacementId = `${game.id}-${originalSeatIndex}`;
          const existingReplacement = seatReplacements.get(replacementId);
          if (existingReplacement) {
            console.log(`[SEAT REPLACEMENT DEBUG] Clearing replacement for seat ${originalSeatIndex} as current player reconnected`);
            clearTimeout(existingReplacement.timer);
            seatReplacements.delete(replacementId);
          }
          
          // Clear any disconnect timeout for this player
          const disconnectTimeoutKey = `${game.id}-${originalSeatIndex}`;
          const existingDisconnectTimeout = disconnectTimeouts.get(disconnectTimeoutKey);
          if (existingDisconnectTimeout) {
            console.log(`[RECONNECT] Clearing disconnect timeout for player ${socket.userId}`);
            clearTimeout(existingDisconnectTimeout);
            disconnectTimeouts.delete(disconnectTimeoutKey);
          }
          
          // Fix bidding state if the game is in bidding phase
          if (game.status === 'BIDDING' && game.bidding) {
            console.log(`[RECONNECT] Fixing bidding state for reconnected player`);
            console.log(`[RECONNECT] Before fix - currentBidderIndex: ${game.bidding.currentBidderIndex}, currentPlayer: ${game.currentPlayer}`);
            
            // If the current player is the reconnected player, make sure bidding state reflects this
            if (game.currentPlayer === socket.userId) {
              // Check if bidding has moved past this player's turn
              if (game.bidding.currentBidderIndex !== originalSeatIndex) {
                console.log(`[RECONNECT] Bidding has moved past player's turn, advancing back to player's turn`);
                console.log(`[RECONNECT] Current bidder index: ${game.bidding.currentBidderIndex}, Player's seat: ${originalSeatIndex}`);
                
                // Advance bidding back to this player's turn
                game.bidding.currentBidderIndex = originalSeatIndex;
                console.log(`[RECONNECT] Updated bidding currentBidderIndex to ${originalSeatIndex} for reconnected player`);
              } else {
                console.log(`[RECONNECT] Bidding is already at player's turn`);
              }
            }
            
            console.log(`[RECONNECT] After fix - currentBidderIndex: ${game.bidding.currentBidderIndex}, currentPlayer: ${game.currentPlayer}`);
          }
        } else {
          // User is not in the game and not the current player
          // Only add them if the game is in WAITING status
          if (game.status !== 'WAITING') {
            console.log(`[JOIN GAME DEBUG] User ${socket.userId} cannot join game in ${game.status} status - game has already started`);
            socket.emit('error', { message: 'Game has already started' });
            return;
          }
          
          // Try to find an empty seat
          const emptySeatIndex = game.players.findIndex((player: GamePlayer | null) => player === null);
          if (emptySeatIndex === -1) {
            console.log(`Game ${gameId} is full`);
            socket.emit('error', { message: 'Game is full' });
            return;
          }

          // Add player to the game
          const playerAvatar = socket.auth?.avatar || '/default-avatar.png';
          const playerUsername = socket.auth?.username || 'Unknown';
          
          console.log('[SOCKET JOIN DEBUG] Adding player to game:', {
            socketUserId: socket.userId,
            socketAuthUsername: socket.auth?.username,
            socketAuthAvatar: socket.auth?.avatar,
            finalUsername: playerUsername,
            finalAvatar: playerAvatar,
            seatIndex: emptySeatIndex
          });
          
          game.players[emptySeatIndex] = {
            id: socket.userId,
            username: playerUsername,
            avatar: playerAvatar,
            type: 'human',
            position: emptySeatIndex
          };
          
          // Create GamePlayer record in database for score tracking
          try {
            if (game.dbGameId) {
              // Get the user's Discord ID from the database
              const user = await prisma.user.findUnique({
                where: { id: socket.userId },
                select: { discordId: true }
              });
              
              await prisma.gamePlayer.create({
                data: {
                  gameId: game.dbGameId,
                  userId: socket.userId,
                  position: emptySeatIndex,
                  team: game.gameMode === 'PARTNERS' ? (emptySeatIndex === 0 || emptySeatIndex === 2 ? 1 : 2) : null,
                  bid: null,
                  bags: 0,
                  points: 0,
                  username: playerUsername,
                  discordId: user?.discordId || null // This should be the actual Discord ID
                }
              });
              console.log('[SOCKET JOIN DEBUG] Created GamePlayer record for player:', socket.userId, 'in game:', game.dbGameId, 'discordId:', user?.discordId);
            } else {
              console.log('[SOCKET JOIN DEBUG] No dbGameId available for GamePlayer creation');
            }
          } catch (error) {
            console.error('[SOCKET JOIN DEBUG] Failed to create GamePlayer record:', error);
            // Don't fail the join if GamePlayer creation fails
          }
          
          // Clear any existing seat replacement for this seat
          const replacementId = `${game.id}-${emptySeatIndex}`;
          const existingReplacement = seatReplacements.get(replacementId);
          if (existingReplacement) {
            console.log(`[SEAT REPLACEMENT DEBUG] Clearing replacement for seat ${emptySeatIndex} as player joined`);
            clearTimeout(existingReplacement.timer);
            seatReplacements.delete(replacementId);
          }
        }
      } else {
        // User is already in the game - allow them to join the socket room
        console.log(`[SOCKET JOIN DEBUG] User ${socket.userId} is already in the game, allowing socket join`);
        
        // Clear any disconnect timeout for this player since they reconnected
        const playerIndex = game.players.findIndex(p => p && p.id === socket.userId);
        if (playerIndex !== -1) {
          const disconnectTimeoutKey = `${game.id}-${playerIndex}`;
          const existingDisconnectTimeout = disconnectTimeouts.get(disconnectTimeoutKey);
          if (existingDisconnectTimeout) {
            console.log(`[RECONNECT] Clearing disconnect timeout for player ${socket.userId} (already in game)`);
            clearTimeout(existingDisconnectTimeout);
            disconnectTimeouts.delete(disconnectTimeoutKey);
          }
        }
      }

      // Join the game room
      socket.join(gameId);
      console.log(`User ${socket.userId} joined game ${gameId}`);
      // Emit confirmation to the client
      socket.emit('joined_game_room', { gameId });
      
      // Send game update to all players in the game room
      const enrichedGame = enrichGameForClient(game, socket.userId);
      console.log('[SERVER DEBUG] Sending game_update to all players:', {
        gameId,
        userId: socket.userId,
        currentPlayer: enrichedGame.currentPlayer,
        status: enrichedGame.status
      });
      io.to(game.id).emit('game_update', enrichedGame);
      
      // Update lobby for all clients
      io.emit('games_updated', games);
    } catch (error) {
      console.error('Error in join_game:', error);
      socket.emit('error', { message: 'Internal server error' });
    }
  });

  // Join game as spectator (for chat access)
  socket.on('join_game_as_spectator', ({ gameId }) => {
    console.log('=== SPECTATOR JOIN EVENT RECEIVED ===');
    console.log('Spectator join attempt:', { gameId, socketId: socket.id, userId: socket.userId });
    
    if (!socket.isAuthenticated || !socket.userId) {
      console.log('Unauthorized join_game_as_spectator attempt');
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    try {
      const game = games.find((g: Game) => g.id === gameId);
      if (!game) {
        console.log(`Game ${gameId} not found for spectator join`);
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      // Check if user is already a spectator
      const isAlreadySpectator = game.spectators.some(
        (spectator: any, _i: number) => spectator.id === socket.userId
      );

      console.log('Spectator join debug:', {
        userId: socket.userId,
        username: socket.auth?.username,
        isAlreadySpectator,
        currentSpectators: game.spectators.map(s => ({ id: s.id, username: s.username }))
      });

      if (!isAlreadySpectator) {
        // Add user as spectator if not already present
        game.spectators.push({
          id: socket.userId,
          username: socket.auth?.username || 'Unknown',
          avatar: socket.auth?.avatar || '/default-avatar.png',
          type: 'human',
        });
        console.log('Added new spectator to game.spectators');
      } else {
        console.log('Spectator already exists in game.spectators');
      }

      // Join the game room for chat
      socket.join(gameId);
      console.log(`Spectator ${socket.userId} joined game ${gameId} for chat`);
      console.log(`Spectator ${socket.userId} socket rooms:`, Array.from(socket.rooms));
      
      // Emit confirmation to the client
      socket.emit('joined_game_room', { gameId });
      
      // Send game update to this spectator only
      socket.emit('game_update', enrichGameForClient(game, socket.userId));
      
      // Only emit games_updated to notify lobby of spectator change
      io.emit('games_updated', games);
    } catch (error) {
      console.error('Error in join_game_as_spectator:', error);
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
        // Get the player before removing them
        const removedPlayer = game.players[playerIdx];
        game.players[playerIdx] = null;
        
        // Track if host replacement occurred
        let hostReplaced = false;
        
        // If the host (seat 0) was removed, appoint a new host
        if (playerIdx === 0) {
          console.log('[HOST REPLACEMENT] Host was removed, appointing new host');
          const newHostIndex = game.players.findIndex((p, i) => p && p.type === 'human' && i !== 0);
          if (newHostIndex !== -1) {
            // Move the new host to seat 0
            const newHost = game.players[newHostIndex];
            game.players[newHostIndex] = null;
            game.players[0] = newHost;
            console.log(`[HOST REPLACEMENT] New host appointed: ${newHost?.username} at seat 0`);
            
            // Update current player if it was the old host
            if (game.play && game.play.currentPlayer === removedPlayer?.id) {
              game.play.currentPlayer = newHost.id;
              game.play.currentPlayerIndex = 0;
              console.log(`[HOST REPLACEMENT] Updated current player to new host: ${newHost.username}`);
            }
            
            // Update current bidder if it was the old host
            if (game.bidding && game.bidding.currentBidderIndex === playerIdx) {
              game.bidding.currentBidderIndex = 0;
              console.log(`[HOST REPLACEMENT] Updated current bidder to new host: ${newHost.username}`);
            }
            
            // Start seat replacement for the now-empty seat (the seat where the new host came from)
            startSeatReplacement(game, newHostIndex);
            hostReplaced = true;
          }
        }
      
      // Remove the player from spectators if they're there
      if (removedPlayer) {
        const spectatorIndex = game.spectators?.findIndex(s => s.id === removedPlayer.id);
        if (spectatorIndex !== -1) {
          game.spectators.splice(spectatorIndex, 1);
          console.log(`[REMOVE PLAYER] Removed ${removedPlayer.username} from spectators`);
        }
      }
      
      socket.leave(gameId);
      
      // Start seat replacement process for the empty seat (only if host wasn't replaced)
      if (!hostReplaced) {
        console.log(`[LEAVE GAME DEBUG] About to start seat replacement for seat ${playerIdx}`);
        console.log(`[LEAVE GAME DEBUG] Seat ${playerIdx} is now:`, game.players[playerIdx]);
        startSeatReplacement(game, playerIdx);
      }
        
        // Emit game_update to the game room for real-time sync
        io.to(gameId).emit('game_update', enrichGameForClient(game));
        io.emit('games_updated', games);
        console.log(`User ${userId} left game ${gameId}`);
      }

      // Check if there are any human players left
      const hasHumanPlayers = game.players.some((p: GamePlayer | null) => p && p.type === 'human');
      
      console.log(`[LEAVE GAME DEBUG] Game ${gameId} - Human players remaining:`, hasHumanPlayers);
      console.log(`[LEAVE GAME DEBUG] Current players:`, game.players.map((p, i) => `${i}: ${p ? `${p.username} (${p.type})` : 'null'}`));
      
      // If no human players remain, remove the game
      if (!hasHumanPlayers) {
        const gameIdx = games.findIndex((g: Game) => g.id === gameId);
        if (gameIdx !== -1) {
          games.splice(gameIdx, 1);
          io.emit('games_updated', games);
          console.log(`[LEAVE GAME] Game ${gameId} removed (no human players left)`);
        } else {
          console.log(`[LEAVE GAME ERROR] Game ${gameId} not found in games array for removal`);
        }
      } else {
        console.log(`[LEAVE GAME] Game ${gameId} kept (human players still present)`);
      }
    } catch (error) {
      console.error('Error in leave_game:', error);
      socket.emit('error', { message: 'Internal server error' });
    }
  });

  // Handle play_start event to trigger bot playing
  socket.on('play_start', ({ gameId }) => {
    const game = games.find(g => g.id === gameId);
    if (!game || !game.play) return;
    
    const currentPlayer = game.players[game.play.currentPlayerIndex];
    if (currentPlayer && currentPlayer.type === 'bot') {
      console.log('[BOT DEBUG] play_start triggered bot playing for:', currentPlayer.username);
      setTimeout(() => {
        botPlayCard(game, game.play.currentPlayerIndex);
      }, 1000);
    } else if (currentPlayer && currentPlayer.type === 'human') {
      // Start timeout for human players in playing phase using the main timeout system
      console.log('[TIMEOUT DEBUG] Starting timeout for human player in playing phase:', currentPlayer.username);
      startTurnTimeout(game, game.play.currentPlayerIndex, 'playing');
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
      // League gating: require the three non-host humans to be ready before starting
      if ((game as any).league) {
        if (!Array.isArray((game as any).leagueReady) || (game as any).leagueReady.length !== 4) {
          (game as any).leagueReady = [false, false, false, false];
        }
        const hostId = game.players[0]?.id;
        const othersReady = game.players.every((p: any, i: number) => {
          if (!p || p.type !== 'human') return true; // bots/empty seats don't gate
          if (p.id === hostId) return true; // host doesn't need to press Ready
          return (game as any).leagueReady[i] === true;
        });
        console.log('[LEAGUE START CHECK] gameId:', gameId, 'hostId:', hostId, 'leagueReady:', (game as any).leagueReady, 'othersReady:', othersReady);
        if (!othersReady) {
          socket.emit('error', { message: 'All non-host players must be ready to start' });
          return;
        }
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
    console.log('[DEBUG] Emitting game_update to all players');
    io.to(game.id).emit('game_update', enrichGameForClient(game));
      // --- FIX: If first bidder is a bot, trigger bot bidding immediately ---
      if (firstBidder.type === 'bot') {
        console.log('[DEBUG] (SOCKET) About to call botMakeMove for seat', (dealerIndex + 1) % 4, 'bot:', firstBidder.username);
        botMakeMove(game, (dealerIndex + 1) % 4);
      } else {
        // Start turn timeout for human players when bidding phase begins
        console.log('[TIMEOUT DEBUG] Starting timeout for first human bidder:', firstBidder.username);
        startTurnTimeout(game, (dealerIndex + 1) % 4, 'bidding');
      }
    } catch (err) {
      console.error('Error in start_game handler:', err);
      socket.emit('error', { message: 'Failed to start game' });
    }
  });

  // --- Game-related socket events ---
  
  // Remove player event (for timeout)
  socket.on('remove_player', ({ gameId, playerId, reason }) => {
  console.log(`[REMOVE PLAYER DEBUG] remove_player event received:`, { gameId, playerId, reason, socketId: socket.id, socketUserId: socket.userId });
    console.log('[REMOVE PLAYER] Received remove_player event:', { gameId, playerId, reason });
    
    if (!socket.isAuthenticated || !socket.userId) {
      console.log('Unauthorized remove_player attempt');
      socket.emit('error', { message: 'Not authorized' });
      return;
    }
    
    const game = games.find(g => g.id === gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    // Find the player to remove
    const playerIndex = game.players.findIndex(p => p && p.id === playerId);
    if (playerIndex === -1) {
      socket.emit('error', { message: 'Player not found in game' });
      return;
    }
    
    // Remove the player
    const removedPlayer = game.players[playerIndex];
    game.players[playerIndex] = null;
    
    // Track if host replacement occurred
    let hostReplaced = false;
    
    // If the host (seat 0) was removed, appoint a new host
    if (playerIndex === 0) {
      console.log('[HOST REPLACEMENT] Host was removed, appointing new host');
      const newHostIndex = game.players.findIndex((p, i) => p && p.type === 'human' && i !== 0);
      if (newHostIndex !== -1) {
        // Move the new host to seat 0
        const newHost = game.players[newHostIndex];
        game.players[newHostIndex] = null;
        game.players[0] = newHost;
        console.log(`[HOST REPLACEMENT] New host appointed: ${newHost?.username} at seat 0`);
        
        // Start seat replacement for the now-empty seat (the seat where the new host came from)
        startSeatReplacement(game, newHostIndex);
        hostReplaced = true;
      }
    }
    
    // Send system message
    if (removedPlayer) {
      io.to(game.id).emit('system_message', {
        message: `${removedPlayer.username} was removed for inactivity`,
        type: 'warning'
      });
    }
    
    // Check if only bots remain
    const remainingHumanPlayers = game.players.filter(p => p && p.type === 'human');
    if (remainingHumanPlayers.length === 0) {
      console.log('[REMOVE PLAYER] No human players remaining, closing game');
      // Remove game from games array
      const gameIndex = games.findIndex(g => g.id === gameId);
      if (gameIndex !== -1) {
        games.splice(gameIndex, 1);
      }
      // Notify all clients that game is closed
      io.to(game.id).emit('game_closed', { reason: 'no_humans_remaining' });
      // Update lobby for all clients
      io.emit('games_updated', getActiveGames());
      return;
    }
    
    // Start seat replacement process (only if host wasn't replaced)
    if (!hostReplaced) {
      console.log(`[REMOVE PLAYER DEBUG] About to start seat replacement for seat ${playerIndex}`);
      console.log(`[REMOVE PLAYER DEBUG] Seat ${playerIndex} is now:`, game.players[playerIndex]);
      startSeatReplacement(game, playerIndex);
    } else {
      console.log(`[REMOVE PLAYER DEBUG] Host was replaced, skipping seat replacement for original seat`);
    }
    
      // Update all clients
  io.to(game.id).emit('game_update', enrichGameForClient(game));
});

  // Fill seat with bot event (manual replacement)
  socket.on('fill_seat_with_bot', ({ gameId, seatIndex }) => {
    console.log('[FILL SEAT] Received fill_seat_with_bot event:', { gameId, seatIndex });
    
    if (!socket.isAuthenticated || !socket.userId) {
      console.log('Unauthorized fill_seat_with_bot attempt');
      socket.emit('error', { message: 'Not authorized' });
      return;
    }
    
    const game = games.find(g => g.id === gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    // Check if seat is empty
    if (game.players[seatIndex] !== null) {
      socket.emit('error', { message: 'Seat is not empty' });
      return;
    }
    
    // Fill the seat with a bot (manual invitation)
    addBotToSeat(game, seatIndex);
  });

  // Play again event
  socket.on('play_again', ({ gameId }) => {
    console.log('[PLAY AGAIN] Received play_again event:', { gameId, userId: socket.userId });
    
    if (!socket.isAuthenticated || !socket.userId) {
      console.log('Unauthorized play_again attempt');
      socket.emit('error', { message: 'Not authorized' });
      return;
    }
    
    const game = games.find(g => g.id === gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    // Add player to responses
    if (!playAgainResponses.has(gameId)) {
      playAgainResponses.set(gameId, new Set());
    }
    playAgainResponses.get(gameId)!.add(socket.userId);
    
    console.log(`[PLAY AGAIN] Player ${socket.userId} responded to play again for game ${gameId}`);
    
    // Check if all human players have responded
    const humanPlayers = game.players.filter(p => p && p.type === 'human');
    const responses = playAgainResponses.get(gameId) || new Set();
    
    if (responses.size >= humanPlayers.length) {
      console.log(`[PLAY AGAIN] All human players responded, resetting game ${gameId}`);
      resetGameForNewRound(game);
    }
  });

  // Make bid event
  socket.on('make_bid', async ({ gameId, userId, bid }) => {
    console.log('[BID DEBUG] make_bid received:', { gameId, userId, bid, socketId: socket.id });
    console.log('[BID DEBUG] Socket auth status:', { isAuthenticated: socket.isAuthenticated, userId: socket.userId });
    
    if (!socket.isAuthenticated || !socket.userId) {
      console.log('Unauthorized make_bid attempt');
      socket.emit('error', { message: 'Not authorized' });
      return;
    }
    
    const game = games.find(g => g.id === gameId);
    console.log('[BID DEBUG] Game lookup result:', { 
      gameFound: !!game, 
      gameId, 
      availableGames: games.map(g => ({ id: g.id, status: g.status })),
      gameStatus: game?.status,
      hasBidding: !!game?.bidding
    });
    
    if (!game || !game.bidding) {
      console.log('[BID DEBUG] Game or bidding not found:', { gameFound: !!game, hasBidding: !!game?.bidding });
      socket.emit('error', { message: 'Game not found or invalid state' });
      return;
    }
    
    // Update game activity
    game.lastActivity = Date.now();
    updateGameActivity(gameId);
    
    const playerIndex = game.players.findIndex(p => p && p.id === userId);
    console.log('[BID DEBUG] make_bid received:', { gameId, userId, bid, playerIndex, currentBidderIndex: game.bidding.currentBidderIndex, bids: game.bidding.bids });
    if (playerIndex === -1) {
      console.log('[BID DEBUG] Bid rejected: player not found');
      socket.emit('error', { message: 'Player not found in game' });
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
    
    // For MIRROR games, automatically calculate the correct bid for human players
    let finalBid = bid;
    if (game.rules?.bidType === 'MIRROR' && game.players[playerIndex]?.type === 'human' && game.hands && game.hands[playerIndex]) {
      const spades = game.hands[playerIndex].filter(c => c.suit === 'S');
      finalBid = spades.length;
      console.log('[MIRROR BID] Human player in Mirror game - calculated bid:', finalBid, 'spades:', spades.length, 'hand:', game.hands[playerIndex].map(c => c.suit + c.rank));
    }
    
    // Store the bid
    game.bidding.bids[playerIndex] = finalBid;
    
    // Update player's bid in game state
    if (game.players[playerIndex]) {
      game.players[playerIndex].bid = finalBid;
    }
    
    // Update GamePlayer record in DB
    if (game.dbGameId && game.players[playerIndex]?.type === 'human') {
      const { updateGamePlayerRecord } = await import('./routes/games.routes');
      updateGamePlayerRecord(game, playerIndex).catch((err: Error) => {
        console.error('Failed to update GamePlayer record after bid:', err);
      });
    }
    
    // Clear turn timeout for this player since they acted
    clearTurnTimeout(game, userId);
    
    // Find next player who hasn't bid
    let next = (playerIndex + 1) % 4;
    while (game.bidding.bids[next] !== null && next !== playerIndex) {
      next = (next + 1) % 4;
    }
    
    if (game.bidding.bids.every(b => b !== null)) {
      // All bids in, move to play phase
      if (game.dealerIndex === undefined || game.dealerIndex === null) {
        socket.emit('error', { message: 'Invalid game state: no dealer assigned' });
        return;
      }
      const firstPlayer = game.players[(game.dealerIndex + 1) % 4];
      if (!firstPlayer) {
        socket.emit('error', { message: 'Invalid game state' });
        return;
      }
      
      // --- Play phase state ---
      game.status = 'PLAYING'; // Update game status to PLAYING
      game.play = {
        currentPlayer: firstPlayer.id,
        currentPlayerIndex: (game.dealerIndex + 1) % 4,
        currentTrick: [],
        tricks: [],
        trickNumber: 0,
        spadesBroken: false
      };
      
      // Update game status in database
      if (game.dbGameId) {
        try {
          await prisma.game.update({
            where: { id: game.dbGameId },
            data: { status: 'PLAYING' }
          });
          console.log('[DB STATUS UPDATE] Updated game status to PLAYING in database:', game.dbGameId);
        } catch (err) {
          console.error('Failed to update game status in database:', err);
        }
      }
      
              // FORCE GAME LOGGING - Create game in database immediately
      if (!game.dbGameId) {
        try {
          const dbGame = await prisma.game.create({
            data: {
              id: game.id, // Use the game's ID as the database ID
              creatorId: game.players.find(p => p && p.type === 'human')?.id || 'unknown',
              gameMode: game.gameMode,
              bidType: 'REGULAR',
              specialRules: [],
              minPoints: game.minPoints,
              maxPoints: game.maxPoints,
              buyIn: game.buyIn,
              rated: game.players.filter(p => p && p.type === 'human').length === 4,
              status: 'PLAYING',
            }
          });
          
          game.dbGameId = dbGame.id;
          console.log('[FORCE GAME LOGGED] Game forced to database with ID:', game.dbGameId);
        } catch (err) {
          console.error('Failed to force log game start:', err);
          game.dbGameId = game.id; // Fallback to in-memory ID
        }
      } else {
        console.log('[GAME ALREADY LOGGED] Game already has dbGameId:', game.dbGameId);
        // Verify the game actually exists in the database
        try {
          const dbGame = await prisma.game.findUnique({
            where: { id: game.dbGameId }
          });
          if (!dbGame) {
            console.log('[GAME NOT IN DB] Game with dbGameId not found in database, recreating...');
            const newDbGame = await prisma.game.create({
              data: {
                id: game.id, // Use the game's ID as the database ID
                creatorId: game.players.find(p => p && p.type === 'human')?.id || 'unknown',
                gameMode: game.gameMode,
                bidType: 'REGULAR',
                specialRules: [],
                minPoints: game.minPoints,
                maxPoints: game.maxPoints,
                buyIn: game.buyIn,
                rated: game.players.filter(p => p && p.type === 'human').length === 4,
                status: 'PLAYING',
              }
            });
            game.dbGameId = newDbGame.id;
            console.log('[GAME RECREATED] Game recreated in database with ID:', game.dbGameId);
          } else {
            console.log('[GAME VERIFIED] Game found in database:', game.dbGameId);
          }
          await prisma.$disconnect();
        } catch (err) {
          console.error('Failed to verify game in database:', err);
        }
      }
  
  // Round logging is now started when game is created
      
      // START ROUND LOGGING FOR FIRST HAND
      if (game.dbGameId) {
        try {
          await trickLogger.startRound(game.dbGameId, 1);
          console.log('[ROUND STARTED] Round 1 started for game:', game.dbGameId);
        } catch (err) {
          console.error('Failed to start round logging for first hand:', err);
        }
      }
      
      console.log('[BIDDING COMPLETE] Moving to play phase, first player:', firstPlayer.username, 'at index:', (game.dealerIndex + 1) % 4);
      
      io.to(game.id).emit('bidding_complete', { bids: game.bidding.bids });
      io.to(game.id).emit('play_start', {
        gameId: game.id,
        currentPlayerIndex: game.play.currentPlayerIndex,
        currentTrick: game.play.currentTrick,
        trickNumber: game.play.trickNumber,
      });
      
      console.log('[PLAY START] Emitted play_start event with currentPlayerIndex:', game.play.currentPlayerIndex, 'firstPlayer:', firstPlayer.username);
      
      // Emit game update AFTER play_start to ensure correct current player
      io.to(game.id).emit('game_update', enrichGameForClient(game));
      
      // If first player is a bot, trigger their move
      if (firstPlayer.type === 'bot') {
        console.log('[BOT TURN] First player is bot, triggering bot play');
        setTimeout(() => {
          botPlayCard(game, (game.dealerIndex + 1) % 4);
        }, 1000);
      } else {
        // Start turn timeout for human players when play phase begins
        console.log('[HUMAN TURN] First player is human, starting turn timeout for:', firstPlayer.username, 'at index:', (game.dealerIndex + 1) % 4);
        startTurnTimeout(game, (game.dealerIndex + 1) % 4, 'playing');
      }
    } else {
      game.bidding.currentBidderIndex = next;
      game.bidding.currentPlayer = game.players[next]?.id ?? '';
      io.to(game.id).emit('bidding_update', {
        currentBidderIndex: next,
        bids: game.bidding.bids,
      });
      
      // Start timeout for human players after bidding update
      const nextPlayer = game.players[next];
      console.log(`[TIMEOUT DEBUG] Next player after bidding update: ${nextPlayer?.username}, type: ${nextPlayer?.type}, index: ${next}`);
      if (nextPlayer && nextPlayer.type === 'human') {
        console.log(`[TIMEOUT DEBUG] Starting timeout for human player ${nextPlayer.username}`);
        startTurnTimeout(game, next, 'bidding');
      }
      
      // Start turn timeout for human players (duplicate code removed)
      console.log(`[TIMEOUT DEBUG] Next player: ${nextPlayer?.username}, type: ${nextPlayer?.type}, index: ${next}`);
      if (nextPlayer && nextPlayer.type === 'human') {
        console.log(`[TIMEOUT DEBUG] Starting timeout for human player ${nextPlayer.username}`);
        startTurnTimeout(game, next, 'bidding');
      } else {
        console.log(`[TIMEOUT DEBUG] Not starting timeout - player is bot or null`);
      }
      
      // If next is a bot, trigger their move
      if (game.players[next] && game.players[next].type === 'bot') {
        console.log('[BOT BIDDING] Triggering bot bid for:', game.players[next].username, 'at index:', next);
        setTimeout(() => {
          botMakeMove(game, next);
        }, 600); // Reduced delay for faster bot bidding
      }
    }
    
    // Emit game update to ensure frontend has latest state
    io.to(game.id).emit('game_update', enrichGameForClient(game));
    
    // Also emit bidding_update for immediate UI feedback if still in bidding phase
    if (game.status === 'BIDDING') {
      io.to(game.id).emit('bidding_update', {
        currentBidderIndex: game.bidding.currentBidderIndex,
        bids: game.bidding.bids,
      });
    }
    
    // Log the current game state for debugging
    console.log('[BIDDING DEBUG] Current game state after bid:', {
      gameId: game.id,
      currentBidderIndex: game.bidding.currentBidderIndex,
      currentPlayer: game.bidding.currentPlayer,
      bids: game.bidding.bids,
      allBidsComplete: game.bidding.bids.every(b => b !== null)
    });
  });



  // Play card event
  socket.on('play_card', ({ gameId, userId, card }) => {
    console.log('[PLAY CARD] Received play_card event:', { gameId, userId, card, socketId: socket.id });
    console.log('[PLAY CARD] Socket auth status:', { isAuthenticated: socket.isAuthenticated, userId: socket.userId });
    const game = games.find(g => g.id === gameId);
    if (!game || !game.play || !game.hands || !game.bidding) {
      socket.emit('error', { message: 'Invalid game state' });
      return;
    }
    
    // Update game activity
    game.lastActivity = Date.now();
    updateGameActivity(gameId);
    
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
    if (!game.hands) {
      socket.emit('error', { message: 'Invalid hand state' });
      return;
    }
    const hands = game.hands.filter((h): h is Card[] => h !== null && h !== undefined);
    const hand = hands[playerIndex]!;
    if (!hand || hand.length === 0) {
      socket.emit('error', { message: 'Invalid hand state' });
      return;
    }
    
    const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (cardIndex === -1) {
      socket.emit('error', { message: 'Card not in hand' });
      return;
    }
    
    // --- ENFORCE SPECIAL RULES ---
    const specialRules = game.rules?.specialRules;
    if (specialRules) {
      const isLeading = game.play.currentTrick.length === 0;
      const leadSuit = isLeading ? null : game.play.currentTrick[0].suit;
      
      // Screamer rules: Players cannot play spades unless they have no other cards
      if (specialRules.screamer) {
        console.log(`[SPECIAL RULES] Screamer validation for player ${userId}`);
        
        if (isLeading) {
          // When leading, cannot lead spades unless only spades left
          const nonSpades = hand.filter(c => c.suit !== "S");
          if (nonSpades.length > 0 && card.suit === "S") {
            socket.emit("error", { message: "Screamer rule: You cannot lead spades unless you only have spades left." });
            return;
          }
        } else {
          // Following suit
          if (leadSuit !== "S") {
            // Not leading spades - cannot trump with spades unless void in lead suit
            const cardsOfLeadSuit = hand.filter(c => c.suit === leadSuit);
            if (cardsOfLeadSuit.length > 0) {
              // Must follow suit, no spade restriction
            } else {
              // Void in lead suit - can only cut if only spades left
              const nonSpades = hand.filter(c => c.suit !== "S");
              if (nonSpades.length > 0 && card.suit === "S") {
                socket.emit("error", { message: "Screamer rule: You cannot cut with spades unless you only have spades left." });
                return;
              }
            }
          }
        }
      }
      
      // Assassin rules: Players must play spades whenever possible
      if (specialRules.assassin) {
        console.log(`[SPECIAL RULES] Assassin validation for player ${userId}`);
        
        if (isLeading) {
          // When leading, must lead spades if spades are broken and have spades
          const spades = hand.filter(c => c.suit === "S");
          if (game.play.spadesBroken && spades.length > 0 && card.suit !== "S") {
            socket.emit("error", { message: "Assassin rule: You must lead spades when spades are broken and you have spades." });
            return;
          }
        } else {
          // Following suit
          if (leadSuit !== "S") {
            // Not leading spades - must trump if have spades and void in lead suit
            const cardsOfLeadSuit = hand.filter(c => c.suit === leadSuit);
            if (cardsOfLeadSuit.length === 0) {
              // Void in lead suit - must cut if have spades
              const spades = hand.filter(c => c.suit === "S");
              if (spades.length > 0 && card.suit !== "S") {
                socket.emit("error", { message: "Assassin rule: You must cut with spades when void in lead suit and you have spades." });
                return;
              }
            }
          }
        }
      }
    }
    
    // Remove card from hand and add to current trick
    hand.splice(cardIndex, 1);
    game.play.currentTrick.push({ ...card, playerIndex });
    // Set spadesBroken if a spade is played
    if (card.suit === 'S') {
      game.play.spadesBroken = true;
    }
    
    // Clear turn timeout for this player since they successfully played a card
    clearTurnTimeout(game, userId);
    
    // Advance to the next player immediately after playing the card
    let nextPlayerIndex = (playerIndex + 1) % 4;
    game.play.currentPlayerIndex = nextPlayerIndex;
    game.play.currentPlayer = game.players[nextPlayerIndex]?.id ?? '';
    console.log('[PLAY TURN DEBUG] Human played card, advancing to next player:', nextPlayerIndex, game.players[nextPlayerIndex]?.username);
    
    // Start turn timeout for human players during playing phase
    const nextPlayer = game.players[nextPlayerIndex];
    if (nextPlayer && nextPlayer.type === 'human') {
      startTurnTimeout(game, nextPlayerIndex, 'playing');
    }

    // If trick is complete (4 cards)
    if (game.play.currentTrick.length === 4) {
      // Determine winner of the trick
      console.log('[TRICK DEBUG] Determining winner for trick:', game.play.currentTrick);
      console.log('[TRICK DEBUG] Current trick length:', game.play.currentTrick.length, 'trickNumber:', game.play.trickNumber);
      const winnerIndex = determineTrickWinner(game.play.currentTrick);
      console.log('[TRICK DEBUG] Winner determined:', winnerIndex, 'Winner player:', game.players[winnerIndex]?.username);
      if (winnerIndex === undefined) {
        socket.emit('error', { message: 'Invalid trick state' });
        return;
      }
      game.play.tricks.push({
        cards: game.play.currentTrick,
        winnerIndex,
      });
      game.play.trickNumber += 1;
      
      // NEW: Log the completed trick to database
      console.log('[TRICK LOGGING] Attempting to log trick', game.play.trickNumber, 'for game', game.id, 'dbGameId:', game.dbGameId);
      trickLogger.logTrickFromGame(game, game.play.trickNumber).catch((err: Error) => {
        console.error('[TRICK LOGGING ERROR] Failed to log trick to database:', err);
        console.error('[TRICK LOGGING ERROR] Game state:', {
          id: game.id,
          dbGameId: game.dbGameId,
          trickNumber: game.play.trickNumber,
          hasPlay: !!game.play,
          hasTricks: !!game.play?.tricks,
          tricksLength: game.play?.tricks?.length
        });
      });
      // Set current player to the winner of the trick
      game.play.currentPlayerIndex = winnerIndex;
      game.play.currentPlayer = game.players[winnerIndex]?.id ?? '';
      console.log('[TRICK DEBUG] Set current player to winner:', winnerIndex, game.players[winnerIndex]?.username);
      
      // Start turn timeout for human players when trick is complete
      const winnerPlayer = game.players[winnerIndex];
      if (winnerPlayer && winnerPlayer.type === 'human') {
        startTurnTimeout(game, winnerIndex, 'playing');
      }
      
      // Update player trick counts
      if (game.players[winnerIndex]) {
        game.players[winnerIndex].tricks = (game.players[winnerIndex].tricks || 0) + 1;
        console.log('[TRICK COUNT DEBUG] Updated trick count for player', winnerIndex, game.players[winnerIndex]?.username, 'to', game.players[winnerIndex].tricks);
        
        // Update GamePlayer record in DB
        if (game.dbGameId && game.players[winnerIndex]?.type === 'human') {
          import('./routes/games.routes').then(({ updateGamePlayerRecord }) => {
            updateGamePlayerRecord(game, winnerIndex).catch((err: Error) => {
              console.error('Failed to update GamePlayer record after trick win:', err);
            });
          });
        }
        console.log('[TRICK COUNT DEBUG] All player trick counts:', game.players.map((p, i) => `${i}: ${p?.username || 'null'} = ${p?.tricks || 0}`));
      }
      
      // Emit trick complete with the current trick before clearing it
      io.to(game.id).emit('trick_complete', {
        trick: {
          cards: game.play.currentTrick,
          winnerIndex: winnerIndex,
        },
        trickNumber: game.play.trickNumber,
      });
      
      // Store the completed trick for animation before clearing
      const completedTrick = [...game.play.currentTrick];
      
      // Clear the trick immediately for proper game state
      game.play!.currentTrick = [];
      
      // Emit immediate game update with cleared trick and updated trick counts
      const enrichedGame = enrichGameForClient(game);
      console.log('[TRICK DEBUG] Emitting game_update with currentPlayer:', enrichedGame.play?.currentPlayer, 'currentPlayerIndex:', enrichedGame.play?.currentPlayerIndex);
      io.to(game.id).emit('game_update', enrichedGame);
      
      // Emit clear trick event after animation delay
      setTimeout(() => {
        io.to(game.id).emit('clear_trick');
      }, 2000); // 2 second delay to match frontend animation
      
      // If all tricks played, move to hand summary/scoring
      console.log('[HAND COMPLETION DEBUG] Checking hand completion - trickNumber:', game.play.trickNumber);
      if (game.play.trickNumber === 13) {
        console.log('[HAND COMPLETION DEBUG] Hand completion triggered! Emitting hand_completed event');
        console.log('[HAND COMPLETION DEBUG] Game mode check:', game.gameMode, 'Type:', typeof game.gameMode);
        console.log('[HAND COMPLETION DEBUG] Full game object keys:', Object.keys(game));
        console.log('[HAND COMPLETION DEBUG] Game rules:', game.rules);
        // --- Hand summary and scoring ---
        
        if (game.gameMode === 'SOLO') {
          // Solo mode scoring
          const handSummary = calculateSoloHandScore(game);
          
          // Update running totals for individual players
          game.playerScores = game.playerScores || [0, 0, 0, 0];
          game.playerBags = game.playerBags || [0, 0, 0, 0];
          
          for (let i = 0; i < 4; i++) {
            game.playerScores[i] += handSummary.playerScores[i];
            game.playerBags[i] += handSummary.playerBags[i];
          }
          
          // Set game status to indicate hand is completed
          game.status = 'HAND_COMPLETED';
          
          // NEW: Log completed hand to database
          trickLogger.logCompletedHand(game).catch((err: Error) => {
            console.error('Failed to log completed hand to database:', err);
          });
          
                  io.to(game.id).emit('hand_completed', {
          // Current hand scores (for hand summary display)
          team1Score: handSummary.playerScores[0] + handSummary.playerScores[2], // Red team (positions 0,2)
          team2Score: handSummary.playerScores[1] + handSummary.playerScores[3], // Blue team (positions 1,3)
          team1Bags: handSummary.playerBags[0] + handSummary.playerBags[2],
          team2Bags: handSummary.playerBags[1] + handSummary.playerBags[3],
          tricksPerPlayer: handSummary.tricksPerPlayer,
          // Running totals (for overall game state)
          playerScores: game.playerScores,
          playerBags: game.playerBags,
          team1TotalScore: game.team1TotalScore,
          team2TotalScore: game.team2TotalScore,
          team1TotalBags: game.team1Bags,
          team2TotalBags: game.team2Bags,
        });
        
        // Update stats for this hand
        updateHandStats(game).catch(err => {
          console.error('Failed to update hand stats:', err);
        });
        } else {
          // Partners mode scoring
        const handSummary = calculatePartnersHandScore(game);
          
        // Update running totals
        game.team1TotalScore = (game.team1TotalScore || 0) + handSummary.team1Score;
        game.team2TotalScore = (game.team2TotalScore || 0) + handSummary.team2Score;
        
        // Add new bags to running total
        game.team1Bags = (game.team1Bags || 0) + handSummary.team1Bags;
        game.team2Bags = (game.team2Bags || 0) + handSummary.team2Bags;
        
        // Apply bag penalty to running total if needed
        if (game.team1Bags >= 10) {
          game.team1TotalScore -= 100;
          game.team1Bags -= 10;
          console.log('[BAG PENALTY] Team 1 hit 10+ bags, applied -100 penalty. New score:', game.team1TotalScore, 'New bags:', game.team1Bags);
        }
        if (game.team2Bags >= 10) {
          game.team2TotalScore -= 100;
          game.team2Bags -= 10;
          console.log('[BAG PENALTY] Team 2 hit 10+ bags, applied -100 penalty. New score:', game.team2TotalScore, 'New bags:', game.team2Bags);
        }
        
        // Set game status to indicate hand is completed
        game.status = 'HAND_COMPLETED';
        (game as any).handCompletedTime = Date.now(); // Track when hand was completed
        
        // NEW: Log completed hand to database
        trickLogger.logCompletedHand(game).catch((err: Error) => {
          console.error('Failed to log completed hand to database:', err);
        });
        
        io.to(game.id).emit('hand_completed', {
          ...handSummary,
          team1TotalScore: game.team1TotalScore,
          team2TotalScore: game.team2TotalScore,
          team1Bags: game.team1Bags,
          team2Bags: game.team2Bags,
        });
        
        // Update stats for this hand
        updateHandStats(game).catch(err => {
          console.error('Failed to update hand stats:', err);
        });
        }
        
        // Emit game update with new status
        io.to(game.id).emit('game_update', enrichGameForClient(game));
        
        // Start hand summary timer for all players to respond
        startHandSummaryTimer(game);
        
        // --- Game over check ---
        // Use the actual game settings - these should always be set when game is created
        const maxPoints = game.maxPoints;
        const minPoints = game.minPoints;
        
        // Validate that we have the required game settings
        if (maxPoints === undefined || minPoints === undefined) {
          console.error('[GAME OVER CHECK] Missing game settings - maxPoints:', maxPoints, 'minPoints:', minPoints);
          return;
        }
        
        if (game.gameMode === 'SOLO') {
          // Solo mode game over check
          const playerScores = game.playerScores || [0, 0, 0, 0];
          console.log('[GAME OVER CHECK] Solo mode - Player scores:', playerScores, 'Max points:', maxPoints, 'Min points:', minPoints);
          
          const isGameOver = playerScores.some(score => score >= maxPoints || score <= minPoints);
          
          if (isGameOver) {
            console.log('[GAME OVER] Solo game ended! Player scores:', playerScores);
            game.status = 'FINISHED';
            
            // Update database status to FINISHED
            if (game.dbGameId) {
              prisma.game.update({
                where: { id: game.dbGameId },
                data: { status: 'FINISHED' }
              }).then(() => {
                console.log('[GAME OVER] Updated database status to FINISHED for solo game:', game.dbGameId);
              }).catch((error) => {
                console.error('[GAME OVER] Failed to update database status for solo game:', error);
              });
            }
            
            let winningPlayer = 0;
            let highestScore = playerScores[0];
            for (let i = 1; i < playerScores.length; i++) {
              if (playerScores[i] > highestScore) {
                highestScore = playerScores[i];
                winningPlayer = i;
              }
            }
            game.winningPlayer = winningPlayer;
            
            io.to(game.id).emit('game_over', {
              playerScores: game.playerScores,
              winningPlayer: game.winningPlayer,
            });
            // Update stats and coins in DB
            updateStatsAndCoins(game, winningPlayer).catch(err => {
              console.error('Failed to update stats/coins:', err);
            });
            // Fallback: ensure completed game is logged to DB and Discord for league games
            console.log('[GAME COMPLETION DEBUG] Game object league property:', (game as any).league);
            console.log('[GAME COMPLETION DEBUG] Game object keys:', Object.keys(game));
            void import('./lib/gameLogger')
              .then(({ logCompletedGameToDbAndDiscord }) => logCompletedGameToDbAndDiscord(game, winningPlayer))
              .catch((e) => console.error('Failed to log completed game (fallback):', e));
          }
        } else {
          // Partners mode game over check
          console.log('[GAME OVER CHECK] Team 1 score:', game.team1TotalScore, 'Team 2 score:', game.team2TotalScore, 'Max points:', maxPoints, 'Min points:', minPoints);
          console.log('[GAME OVER DEBUG] Game status:', game.status, 'Game mode:', game.gameMode);
          console.log('[GAME OVER DEBUG] Team 1 <= minPoints:', game.team1TotalScore <= minPoints);
          console.log('[GAME OVER DEBUG] Team 2 <= minPoints:', game.team2TotalScore <= minPoints);
          console.log('[GAME OVER DEBUG] Team 1 >= maxPoints:', game.team1TotalScore >= maxPoints);
          console.log('[GAME OVER DEBUG] Team 2 >= maxPoints:', game.team2TotalScore >= maxPoints);
          
          // Check if game should end (only when there's a clear winner)
          let shouldEndGame = false;
          let winningTeam = null;
          
          // If either team is below minPoints, they lose immediately
          if (game.team1TotalScore <= minPoints) {
            shouldEndGame = true;
            winningTeam = 2;
          } else if (game.team2TotalScore <= minPoints) {
            shouldEndGame = true;
            winningTeam = 1;
          }
          // If either team is above maxPoints, check if they have a clear lead
          else if (game.team1TotalScore >= maxPoints) {
            if (game.team1TotalScore > game.team2TotalScore) {
              shouldEndGame = true;
              winningTeam = 1;
            }
            // If tied at maxPoints, continue the game
          } else if (game.team2TotalScore >= maxPoints) {
            if (game.team2TotalScore > game.team1TotalScore) {
              shouldEndGame = true;
              winningTeam = 2;
            }
            // If tied at maxPoints, continue the game
          }
          
          if (shouldEndGame && winningTeam) {
            console.log('[GAME OVER] Game ended! Team 1:', game.team1TotalScore, 'Team 2:', game.team2TotalScore, 'Winner:', winningTeam);
            completeGame(game, winningTeam).catch(err => {
              console.error('Failed to complete game:', err);
            });
          }
        }
      }
      
      // Game over check - run this more frequently
      const maxPoints = game.maxPoints;
      const minPoints = game.minPoints;
      
      if (maxPoints !== undefined && minPoints !== undefined) {
        if (game.gameMode === 'SOLO') {
          const playerScores = game.playerScores || [0, 0, 0, 0];
          const isGameOver = playerScores.some(score => score >= maxPoints || score <= minPoints);
          
          if (isGameOver) {
            console.log('[GAME OVER] Solo game ended! Player scores:', playerScores);
            game.status = 'FINISHED';
            
            let winningPlayer = 0;
            let highestScore = playerScores[0];
            for (let i = 1; i < playerScores.length; i++) {
              if (playerScores[i] > highestScore) {
                highestScore = playerScores[i];
                winningPlayer = i;
              }
            }
            
            io.to(game.id).emit('game_over', {
              playerScores: game.playerScores,
              winningPlayer: winningPlayer,
            });
            
            updateStatsAndCoins(game, winningPlayer).catch(err => {
              console.error('Failed to update stats/coins:', err);
            });
            
            void import('./lib/gameLogger')
              .then(({ logCompletedGameToDbAndDiscord }) => logCompletedGameToDbAndDiscord(game, winningPlayer))
              .catch((e) => console.error('Failed to log completed game (fallback):', e));
          }
        } else {
          // Partners mode
          const team1Score = game.team1TotalScore || 0;
          const team2Score = game.team2TotalScore || 0;
          
          let shouldEndGame = false;
          let winningTeam = null;
          
          if (team1Score <= minPoints) {
            shouldEndGame = true;
            winningTeam = 2;
          } else if (team2Score <= minPoints) {
            shouldEndGame = true;
            winningTeam = 1;
          } else if (team1Score >= maxPoints && team1Score > team2Score) {
            shouldEndGame = true;
            winningTeam = 1;
          } else if (team2Score >= maxPoints && team2Score > team1Score) {
            shouldEndGame = true;
            winningTeam = 2;
          }
          
          if (shouldEndGame && winningTeam) {
            console.log('[GAME OVER] Partners game ended! Team 1:', team1Score, 'Team 2:', team2Score, 'Winner:', winningTeam);
            game.status = 'FINISHED';
            
            // Update database status to FINISHED
            if (game.dbGameId) {
              prisma.game.update({
                where: { id: game.dbGameId },
                data: { status: 'FINISHED' }
              }).then(() => {
                console.log('[GAME OVER] Updated database status to FINISHED for partners game:', game.dbGameId);
              }).catch((error) => {
                console.error('[GAME OVER] Failed to update database status for partners game:', error);
              });
            }
            
            io.to(game.id).emit('game_over', {
              team1Score: team1Score,
              team2Score: team2Score,
              winningTeam: winningTeam,
            });
            
            updateStatsAndCoins(game, winningTeam).catch(err => {
              console.error('Failed to update stats/coins:', err);
            });
            
            console.log('[GAME COMPLETION] About to call gameLogger for game:', game.id, 'winningTeam:', winningTeam);
            void import('./lib/gameLogger')
              .then(({ logCompletedGameToDbAndDiscord }) => {
                console.log('[GAME COMPLETION] Successfully imported gameLogger, calling with game:', game.id);
                return logCompletedGameToDbAndDiscord(game, winningTeam);
              })
              .then(() => {
                console.log('[GAME COMPLETION] gameLogger completed successfully for game:', game.id);
              })
              .catch((e) => {
                console.error('[GAME COMPLETION] Failed to log completed game:', e);
                console.error('[GAME COMPLETION] Game state:', {
                  id: game.id,
                  dbGameId: game.dbGameId,
                  league: (game as any).league,
                  rated: (game as any).rated,
                  status: game.status
                });
              });
          }
        }
      }
      
      // Additional check: If all hands are empty and we have 13 tricks total, force hand completion
      const totalTricksPlayed = game.players.reduce((sum, p) => sum + (p?.tricks || 0), 0);
      if (totalTricksPlayed === 13 && game.players.every(p => Array.isArray(p.hand) && p.hand.length === 0)) {
        console.log('[FORCE HAND COMPLETION] All hands empty and 13 tricks played, forcing hand completion');
        console.log('[FORCE HAND COMPLETION DEBUG] Game mode check:', game.gameMode, 'Type:', typeof game.gameMode);
        console.log('[FORCE HAND COMPLETION DEBUG] Full game object keys:', Object.keys(game));
        console.log('[FORCE HAND COMPLETION DEBUG] Game rules:', game.rules);
        
        if (game.gameMode === 'SOLO') {
          // Solo mode scoring
          const handSummary = calculateSoloHandScore(game);
          
          // Update running totals for individual players
          game.playerScores = game.playerScores || [0, 0, 0, 0];
          game.playerBags = game.playerBags || [0, 0, 0, 0];
          
          for (let i = 0; i < 4; i++) {
            game.playerScores[i] += handSummary.playerScores[i];
            game.playerBags[i] += handSummary.playerBags[i];
          }
          
          // Set game status to indicate hand is completed
          game.status = 'HAND_COMPLETED';
          
          console.log('[FORCE HAND COMPLETED] Emitting hand_completed event with data:', {
            // Current hand scores (for hand summary display)
            team1Score: handSummary.playerScores[0] + handSummary.playerScores[2], // Red team (positions 0,2)
            team2Score: handSummary.playerScores[1] + handSummary.playerScores[3], // Blue team (positions 1,3)
            team1Bags: handSummary.playerBags[0] + handSummary.playerBags[2],
            team2Bags: handSummary.playerBags[1] + handSummary.playerBags[3],
            tricksPerPlayer: handSummary.tricksPerPlayer,
            // Running totals (for overall game state)
            playerScores: game.playerScores,
            playerBags: game.playerBags,
            team1TotalScore: game.team1TotalScore,
            team2TotalScore: game.team2TotalScore,
            team1TotalBags: game.team1Bags,
            team2TotalBags: game.team2Bags,
          });
          io.to(game.id).emit('hand_completed', {
            // Current hand scores (for hand summary display)
            team1Score: handSummary.playerScores[0] + handSummary.playerScores[2], // Red team (positions 0,2)
            team2Score: handSummary.playerScores[1] + handSummary.playerScores[3], // Blue team (positions 1,3)
            team1Bags: handSummary.playerBags[0] + handSummary.playerBags[2],
            team2Bags: handSummary.playerBags[1] + handSummary.playerBags[3],
            tricksPerPlayer: handSummary.tricksPerPlayer,
            // Running totals (for overall game state)
            playerScores: game.playerScores,
            playerBags: game.playerBags,
            team1TotalScore: game.team1TotalScore,
            team2TotalScore: game.team2TotalScore,
            team1TotalBags: game.team1Bags,
            team2TotalBags: game.team2Bags,
          });
        } else {
          // Partners mode scoring
        const handSummary = calculatePartnersHandScore(game);
        
        // Update running totals
        game.team1TotalScore = (game.team1TotalScore || 0) + handSummary.team1Score;
        game.team2TotalScore = (game.team2TotalScore || 0) + handSummary.team2Score;
        
        // Add new bags to running total
        game.team1Bags = (game.team1Bags || 0) + handSummary.team1Bags;
        game.team2Bags = (game.team2Bags || 0) + handSummary.team2Bags;
        
        // Apply bag penalty to running total if needed
        if (game.team1Bags >= 10) {
          game.team1TotalScore -= 100;
          game.team1Bags -= 10;
          console.log('[BAG PENALTY] Team 1 hit 10+ bags, applied -100 penalty. New score:', game.team1TotalScore, 'New bags:', game.team1Bags);
        }
        if (game.team2Bags >= 10) {
          game.team2TotalScore -= 100;
          game.team2Bags -= 10;
          console.log('[BAG PENALTY] Team 2 hit 10+ bags, applied -100 penalty. New score:', game.team2TotalScore, 'New bags:', game.team2Bags);
        }
        
        // Set game status to indicate hand is completed
        game.status = 'HAND_COMPLETED';
        (game as any).handCompletedTime = Date.now(); // Track when hand was completed
        
        console.log('[FORCE HAND COMPLETED] Emitting hand_completed event with data:', {
          ...handSummary,
          team1TotalScore: game.team1TotalScore,
          team2TotalScore: game.team2TotalScore,
          team1Bags: game.team1Bags,
          team2Bags: game.team2Bags,
        });
        io.to(game.id).emit('hand_completed', {
          ...handSummary,
          team1TotalScore: game.team1TotalScore,
          team2TotalScore: game.team2TotalScore,
          team1Bags: game.team1Bags,
          team2Bags: game.team2Bags,
        });
        }
        
        // Emit game update with new status
        io.to(game.id).emit('game_update', enrichGameForClient(game));
        
        // --- Game over check ---
        // Use the actual game settings - these should always be set when game is created
        const maxPoints = game.maxPoints;
        const minPoints = game.minPoints;
        
        // Validate that we have the required game settings
        if (maxPoints === undefined || minPoints === undefined) {
          console.error('[GAME OVER CHECK] Missing game settings - maxPoints:', maxPoints, 'minPoints:', minPoints);
          return;
        }
        
        console.log('[GAME OVER CHECK] Team 1 score:', game.team1TotalScore, 'Team 2 score:', game.team2TotalScore, 'Max points:', maxPoints, 'Min points:', minPoints);
        
        // Check if game should end (only when there's a clear winner)
        let shouldEndGame = false;
        let winningTeam = null;
        
        // If either team is below minPoints, they lose immediately
        if (game.team1TotalScore <= minPoints) {
          shouldEndGame = true;
          winningTeam = 2;
        } else if (game.team2TotalScore <= minPoints) {
          shouldEndGame = true;
          winningTeam = 1;
        }
        // If either team is above maxPoints, check if they have a clear lead
        else if (game.team1TotalScore >= maxPoints) {
          if (game.team1TotalScore > game.team2TotalScore) {
            shouldEndGame = true;
            winningTeam = 1;
          }
          // If tied at maxPoints, continue the game
        } else if (game.team2TotalScore >= maxPoints) {
          if (game.team2TotalScore > game.team1TotalScore) {
            shouldEndGame = true;
            winningTeam = 2;
          }
          // If tied at maxPoints, continue the game
        }
        
        if (shouldEndGame && winningTeam) {
          console.log('[GAME OVER] Game ended! Team 1:', game.team1TotalScore, 'Team 2:', game.team2TotalScore, 'Winner:', winningTeam);
          completeGame(game, winningTeam).catch(err => {
            console.error('Failed to complete game:', err);
          });
        }
        return;
      }
      
      // If next player is a bot, trigger their move with a delay
      if (game.players[game.play.currentPlayerIndex] && game.players[game.play.currentPlayerIndex]!.type === 'bot') {
        console.log('[BOT TURN] Triggering bot turn for:', game.players[game.play.currentPlayerIndex]!.username, 'at index:', game.play.currentPlayerIndex);
        setTimeout(() => {
          // Double-check that it's still this bot's turn before playing
          if (game.play && game.play.currentPlayerIndex === game.play.currentPlayerIndex && 
              game.players[game.play.currentPlayerIndex] && game.players[game.play.currentPlayerIndex]!.type === 'bot') {
            botPlayCard(game, game.play.currentPlayerIndex);
          }
        }, 800); // Reduced delay for faster bot play
      }
      // If the next player is a human, DO NOT trigger any bot moves - wait for human input
      
      // Failsafe: If all hands are empty but we haven't reached 13 tricks, force completion
      // ONLY check this when a trick is complete (4 cards played)
      if (game.play.currentTrick.length === 4) {
        console.log('[FAILSAFE DEBUG] Checking failsafe - hands:', game.players.map(p => ({ id: p?.id, handLength: p?.hand?.length || 0 })));
        console.log('[FAILSAFE DEBUG] Current trick length:', game.play.currentTrick.length, 'trickNumber:', game.play.trickNumber);
        
        if (game.players.every(p => Array.isArray(p.hand) && p.hand.length === 0) && game.play.trickNumber < 13) {
          console.log('[FAILSAFE] All hands empty but only', game.play.trickNumber, 'tricks completed. Forcing hand completion.');
          
          // If there are any cards left in the current trick, score it as the final trick
          if (game.play.currentTrick.length > 0) {
            console.log('[FAILSAFE] Incomplete trick detected with', game.play.currentTrick.length, 'cards. Forcing trick completion.');
            const finalWinnerIndex = determineTrickWinner(game.play.currentTrick);
            game.play.tricks.push({
              cards: game.play.currentTrick,
              winnerIndex: finalWinnerIndex,
            });
            game.play.trickNumber += 1;
            
            // NEW: Log the completed trick to database
            trickLogger.logTrickFromGame(game, game.play.trickNumber).catch((err: Error) => {
              console.error('Failed to log trick to database:', err);
            });
            
            if (game.players[finalWinnerIndex]) {
              game.players[finalWinnerIndex].tricks = (game.players[finalWinnerIndex].tricks || 0) + 1;
            }
            game.play.currentTrick = [];
            console.log('[FAILSAFE] Forced final trick completion, new trickNumber:', game.play.trickNumber);
          }
          
          // Force hand completion regardless of trick number
          console.log('[FAILSAFE] Forcing hand completion due to empty hands');
          game.status = 'HAND_COMPLETED';
          (game as any).handCompletedTime = Date.now(); // Track when hand was completed
          
          // NEW: Log completed hand to database
          trickLogger.logCompletedHand(game).catch((err: Error) => {
            console.error('Failed to log completed hand to database:', err);
          });
          
          // Calculate final scores based on game mode
          let finalScores;
          if (game.gameMode === 'SOLO') {
            finalScores = calculateSoloHandScore(game);
            console.log('[FAILSAFE] Solo final scores calculated:', finalScores);
          } else {
            finalScores = calculatePartnersHandScore(game);
            console.log('[FAILSAFE] Partners final scores calculated:', finalScores);
          }
          
          // Emit hand completed event
          io.to(game.id).emit('hand_completed', finalScores);
          console.log('[FAILSAFE] Hand completed event emitted');
          
          // Update stats for this hand
          updateHandStats(game).catch(err => {
            console.error('Failed to update hand stats:', err);
          });
          
          return; // Exit early to prevent further processing
        }
      }
    } else {
      // Trick is not complete, advance to next player
      // If the next player is a bot, trigger their move with a longer delay
      if (game.players[nextPlayerIndex] && game.players[nextPlayerIndex]!.type === 'bot') {
        console.log('[BOT TURN] Triggering bot turn for incomplete trick:', game.players[nextPlayerIndex]!.username, 'at index:', nextPlayerIndex);
        setTimeout(() => {
          // Double-check that it's still this bot's turn before playing
          if (game.play && game.play.currentPlayerIndex === nextPlayerIndex && 
              game.players[nextPlayerIndex] && game.players[nextPlayerIndex]!.type === 'bot') {
            botPlayCard(game, nextPlayerIndex);
          }
        }, 800); // Reduced delay for faster bot play
      }
      // If the next player is a human, DO NOT trigger any bot moves - wait for human input
    }
    
    // Emit play update
    const playUpdate = {
      currentPlayerIndex: game.play.currentTrick.length === 4 ? game.play.currentPlayerIndex : nextPlayerIndex,
      currentTrick: game.play.currentTrick,
      hands: game.hands.map((h, i) => ({
        playerId: game.players[i]?.id,
        handCount: h.length,
      })),
    };
    console.log('[PLAY DEBUG] Emitting play_update with currentPlayerIndex:', playUpdate.currentPlayerIndex);
    io.to(game.id).emit('play_update', playUpdate);
    io.to(game.id).emit('game_update', enrichGameForClient(game));
  });

  // Hand summary continue tracking
  const handSummaryResponses = new Map<string, Set<string>>(); // gameId -> Set of player IDs who clicked continue
  const handSummaryTimers = new Map<string, { gameId: string, timer: NodeJS.Timeout, expiresAt: number }>();

  // Function to start hand summary timer
  function startHandSummaryTimer(game: Game) {
    console.log('[HAND SUMMARY] Starting 10-second timer for game:', game.id);
    
    // Clear any existing timer for this game
    const existingTimer = handSummaryTimers.get(game.id);
    if (existingTimer) {
      clearTimeout(existingTimer.timer);
    }

    // Start 10-second timer
    const timer = setTimeout(() => {
      console.log('[HAND SUMMARY] Timer expired for game:', game.id);
      
      // Clear responses and timer
      handSummaryResponses.delete(game.id);
      handSummaryTimers.delete(game.id);
      
      // Start new hand regardless of responses
      startNewHand(game);
    }, 10000); // 10 seconds

    // Store timer
    handSummaryTimers.set(game.id, { gameId: game.id, timer, expiresAt: Date.now() + 10000 });
  }

  // Hand summary continue event
  socket.on('hand_summary_continue', ({ gameId }) => {
    console.log('[SERVER] hand_summary_continue event received:', { gameId, socketId: socket.id, userId: socket.userId });
    
    if (!socket.isAuthenticated || !socket.userId) {
      console.log('Unauthorized hand_summary_continue attempt');
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

      // Check if game is in HAND_COMPLETED status
      if (game.status !== 'HAND_COMPLETED') {
        console.log('[HAND SUMMARY] Game is not in HAND_COMPLETED status');
        socket.emit('error', { message: 'Game is not ready for hand summary' });
        return;
      }

      // Initialize response tracking for this game if not exists
      if (!handSummaryResponses.has(gameId)) {
        handSummaryResponses.set(gameId, new Set());
      }

      // Add this player to the responses
      const responses = handSummaryResponses.get(gameId)!;
      responses.add(socket.userId);
      
      console.log('[HAND SUMMARY] Player clicked continue:', socket.userId);
      console.log('[HAND SUMMARY] Responses so far:', Array.from(responses));
      console.log('[HAND SUMMARY] Total players:', game.players.filter(p => p && p.type === 'human').length);

      // Check if all human players have responded
      const humanPlayers = game.players.filter(p => p && p.type === 'human');
      const allHumanPlayersResponded = humanPlayers.every(player => responses.has(player.id));

      if (allHumanPlayersResponded) {
        console.log('[HAND SUMMARY] All players responded, starting new hand');
        
        // Clear the timer and responses
        const timer = handSummaryTimers.get(gameId);
        if (timer) {
          clearTimeout(timer.timer);
          handSummaryTimers.delete(gameId);
        }
        handSummaryResponses.delete(gameId);

        // Start the new hand
        startNewHand(game);
      } else {
        console.log('[HAND SUMMARY] Not all players responded yet, waiting...');
        // Emit confirmation to this player that their continue was received
        socket.emit('hand_summary_continue_confirmed');
      }

    } catch (error) {
      console.error('Error in hand_summary_continue:', error);
      socket.emit('error', { message: 'Internal server error' });
    }
  });

  // Start new hand event (now only called internally)
  function startNewHand(game: Game) {
    console.log('[START NEW HAND] Starting new hand for game:', game.id);

    // Check if all seats are filled
    const filledSeats = game.players.filter(p => p !== null).length;
    if (filledSeats < 4) {
      console.log('[START NEW HAND] Not all seats are filled, cannot start new hand');
      return;
    }

    // Move dealer to the left (next position)
    const newDealerIndex = (game.dealerIndex + 1) % 4;
    game.dealerIndex = newDealerIndex;

    // Reset game state for new hand
    game.status = 'BIDDING';
    game.hands = dealCards(game.players, newDealerIndex);
    game.bidding = {
      currentBidderIndex: (newDealerIndex + 1) % 4,
      currentPlayer: game.players[(newDealerIndex + 1) % 4]?.id ?? '',
      bids: [null, null, null, null],
      nilBids: {}
    };
    game.play = undefined;

    // Reset player trick counts for new hand
    game.players.forEach(player => {
      if (player) {
        player.tricks = 0;
      }
    });

    // Start a new round in DB for this hand
    if (game.dbGameId) {
      const roundNumber = ((trickLogger.getCurrentRoundNumber(game.dbGameId) || 0) + 1);
      import('./lib/trickLogger').then(({ trickLogger }) => {
        trickLogger.startRound(game.dbGameId!, roundNumber).then(() => {
          console.log(`[ROUND STARTED] Round ${roundNumber} started for game:`, game.dbGameId);
        }).catch((err: Error) => {
          console.error('Failed to start round logging for new hand:', err);
        });
      }).catch((e: Error) => console.error('Failed to import trickLogger for start_new_hand:', e));
    }

    // Emit new hand started event with dealing phase
    console.log('[START NEW HAND] Emitting new_hand_started event');
    io.to(game.id).emit('new_hand_started', {
      dealerIndex: newDealerIndex,
      hands: game.hands,
      currentBidderIndex: game.bidding.currentBidderIndex
    });

    // Emit game update
    io.to(game.id).emit('game_update', enrichGameForClient(game));

    // Add delay before starting bidding phase
    setTimeout(() => {
      console.log('[START NEW HAND] Starting bidding phase after delay');
      
      // Emit bidding ready event
      io.to(game.id).emit('bidding_ready', {
        currentBidderIndex: game.bidding.currentBidderIndex,
        currentPlayer: game.bidding.currentPlayer
      });

      // If first bidder is a bot, trigger their bid
      const firstBidder = game.players[game.bidding.currentBidderIndex];
      if (firstBidder && firstBidder.type === 'bot') {
        setTimeout(() => {
          botMakeMove(game, game.bidding.currentBidderIndex);
        }, 600); // Reduced delay for faster bot bidding
      }
    }, 1200); // Reduced delay after dealing
  }

  // Legacy start_new_hand event (for backward compatibility, but now just calls hand_summary_continue)
  socket.on('start_new_hand', ({ gameId }) => {
    console.log('[SERVER] Legacy start_new_hand event received, redirecting to hand_summary_continue');
    // Emit the hand_summary_continue event instead
    socket.emit('hand_summary_continue', { gameId });
  });

  // Close table event
  socket.on('close_table', ({ gameId, reason }) => {
    console.log('[CLOSE TABLE] Received close_table event:', { gameId, reason });
    
    if (!socket.isAuthenticated || !socket.userId) {
      console.log('Unauthorized close_table attempt');
      socket.emit('error', { message: 'Not authorized' });
      return;
    }
    
    const game = games.find(g => g.id === gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    // Remove game from games array
    const gameIndex = games.findIndex(g => g.id === gameId);
    if (gameIndex !== -1) {
      games.splice(gameIndex, 1);
    }
    
    // Notify all clients that game is closed
    io.to(game.id).emit('game_closed', { reason });
    
    // Update lobby for all clients
    const activeGames = games.filter(game => game.players.every(player => player !== null));
    io.emit('games_updated', activeGames);
  });

  // Handle socket disconnection
  socket.on('disconnect', () => {
    console.log('[DISCONNECT] Socket disconnected:', socket.id);
    
    // Find all games this user was in
    games.forEach((game, gameIndex) => {
      const playerIndex = game.players.findIndex(p => p && p.id === socket.userId);
      
      if (playerIndex !== -1) {
        const disconnectedPlayer = game.players[playerIndex];
        console.log('[DISCONNECT] Player disconnected from game:', disconnectedPlayer?.username, 'from game:', game.id);
        
        // Send system message
        if (disconnectedPlayer) {
          io.to(game.id).emit('system_message', {
            message: `${disconnectedPlayer.username} disconnected`,
            type: 'warning'
          });
        }
        
        // Check if only bots remain
        const remainingHumanPlayers = game.players.filter(p => p && p.type === 'human');
        
        // Only delete the game if no human players remain and it's been abandoned for a while
        // This prevents deleting games when players are just navigating between pages
        if (remainingHumanPlayers.length === 0) {
          // Set a timeout to delete the game after 30 seconds if no humans rejoin
          setTimeout(() => {
            const gameStillExists = games.find(g => g.id === game.id);
            if (gameStillExists) {
              const stillNoHumans = gameStillExists.players.filter(p => p && p.type === 'human').length === 0;
              if (stillNoHumans) {
                console.log('[DISCONNECT] Game abandoned for 30 seconds, closing game:', game.id);
                const gameIndex = games.findIndex(g => g.id === game.id);
                if (gameIndex !== -1) {
                  games.splice(gameIndex, 1);
                  io.to(game.id).emit('game_closed', { reason: 'game_abandoned' });
                  // Update lobby for all clients
                  const activeGames = games.filter(game => game.players.every(player => player !== null));
                  io.emit('games_updated', activeGames);
                }
              }
            }
          }, 30000); // 30 second timeout
        }
      }
    });
  });

  // Listen for bidding updates to start timeouts for human players
  socket.on('bidding_update', (data: { currentBidderIndex: number, bids: (number | null)[] }) => {
    console.log('[TIMEOUT DEBUG] Bidding update received:', data);
    // Find the game that this socket is in
    const game = games.find(g => g.players.some(p => p && p.id === socket.userId));
    if (!game || game.status !== 'BIDDING') return;
    
    const currentBidder = game.players[data.currentBidderIndex];
    console.log('[TIMEOUT DEBUG] Current bidder:', currentBidder?.username, 'type:', currentBidder?.type);
    
    if (currentBidder && currentBidder.type === 'human') {
      console.log('[TIMEOUT DEBUG] Starting timeout for human player:', currentBidder.username);
      startTurnTimeout(game, data.currentBidderIndex, 'bidding');
    }
  });

  // Listen for timeout start events from bot bidding logic
  socket.on('start_timeout', (data: { playerIndex: number, phase: 'bidding' | 'playing' }) => {
    console.log('[TIMEOUT DEBUG] start_timeout event received:', data);
    const game = games.find(g => g.players.some(p => p && p.id === socket.userId));
    if (!game) return;
    
    const player = game.players[data.playerIndex];
    if (player && player.type === 'human') {
      console.log('[TIMEOUT DEBUG] Starting timeout from bot bidding logic for:', player.username);
      startTurnTimeout(game, data.playerIndex, data.phase);
    }
  });

  // Handle heartbeat pings from mobile devices
  socket.on('ping', () => {
    console.log('[HEARTBEAT] Received ping from socket:', socket.id);
    socket.emit('pong');
  });

  // Player toggles ready in league game
  socket.on('league_ready', ({ gameId, ready }: { gameId: string; ready: boolean }) => {
    try {
      const game = games.find((g: any) => g.id === gameId);
      if (!game || !game.league) return;
      ensureLeagueReady(game);
      const idx = game.players.findIndex((p: any) => p && p.id === socket.userId);
      if (idx === -1) return;
      // Latch to true: once ready, stays ready (never resets to false via this path)
      const before = [...game.leagueReady];
      game.leagueReady[idx] = game.leagueReady[idx] || !!ready;
      console.log('[LEAGUE READY] gameId:', gameId, 'userId:', socket.userId, 'seat:', idx, 'before:', before, 'after:', game.leagueReady);
      io.to(gameId).emit('league_ready_update', { gameId, leagueReady: game.leagueReady });
    } catch (e) {
      console.log('league_ready error', e);
    }
  });

  // Host attempts to start a league game
  socket.on('league_start', ({ gameId }: { gameId: string }) => {
    try {
      const game = games.find((g: any) => g.id === gameId);
      if (!game || !game.league) return;
      ensureLeagueReady(game);
      // Host is seat 0 by convention (creator)
      const isHost = game.players[0]?.id === socket.userId;
      if (!isHost) return;
      const allHumansReady = game.players.every((p: any, i: number) => p && p.type === 'human' ? game.leagueReady[i] : true);
      if (!allHumansReady) {
        io.to(socket.id).emit('league_start_denied', { reason: 'not_all_ready', leagueReady: game.leagueReady });
        return;
      }
      // Reuse existing start logic by emitting existing event
      io.to(gameId).emit('league_starting');
      // Optionally call existing handler if any (left as is to avoid big refactor)
    } catch (e) {
      console.log('league_start error', e);
    }
  });

  // When a player disconnects, preserve ready state as requested (no auto-clear)
  socket.on('disconnect', () => {
    try {
      games.forEach((game: any) => {
        if (game.league && Array.isArray(game.players)) {
          // No changes to leagueReady on disconnect
        }
      });
    } catch {}
  });
});

// Seat replacement management - already declared above

// Play again management
const playAgainTimers = new Map<string, { gameId: string, timer: NodeJS.Timeout, expiresAt: number }>();
const playAgainResponses = new Map<string, Set<string>>(); // gameId -> Set of player IDs who responded

export function startSeatReplacement(game: Game, seatIndex: number) {
  console.log(`[SEAT REPLACEMENT DEBUG] Starting replacement for seat ${seatIndex} in game ${game.id}`);
  console.log(`[SEAT REPLACEMENT DEBUG] Current players:`, game.players.map((p, i) => `${i}: ${p ? `${p.username} (${p.type})` : 'null'}`));
  console.log(`[SEAT REPLACEMENT DEBUG] Seat ${seatIndex} value:`, game.players[seatIndex]);
  
  // Check if seat is actually empty
  if (game.players[seatIndex] !== null) {
    console.log(`[SEAT REPLACEMENT DEBUG] Seat ${seatIndex} is not empty, skipping replacement`);
    return;
  }
  
  const replacementId = `${game.id}-${seatIndex}`;
  
  // Cancel any existing replacement for this seat
  const existing = seatReplacements.get(replacementId);
  if (existing) {
    console.log(`[SEAT REPLACEMENT DEBUG] Cancelling existing replacement for seat ${seatIndex}`);
    clearTimeout(existing.timer);
  }
  
  // Set 2-minute timer
  const expiresAt = Date.now() + 120000; // 2 minutes
  const timer = setTimeout(() => {
    console.log(`[SEAT REPLACEMENT] Timer expired for seat ${seatIndex} in game ${game.id}`);
            fillSeatWithBot(game, seatIndex).catch(err => {
          console.error('[SEAT REPLACEMENT] Error filling seat with bot:', err);
        });
  }, 120000);
  
  seatReplacements.set(replacementId, { gameId: game.id, seatIndex, timer, expiresAt });
  
  // Notify clients about seat replacement
  io.to(game.id).emit('seat_replacement_started', {
    gameId: game.id,
    seatIndex,
    expiresAt
  });
  
  console.log(`[SEAT REPLACEMENT] Started replacement for seat ${seatIndex} in game ${game.id}`);
}



function addBotToSeat(game: Game, seatIndex: number) {
  console.log(`[BOT INVITATION] Adding bot to seat ${seatIndex} in game ${game.id}`);
  
  // Check if seat is empty
  if (game.players[seatIndex] !== null) {
    console.log(`[BOT INVITATION] Seat ${seatIndex} is not empty`);
    return;
  }
  
  // Create bot
  const botId = `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const botNumber = Math.floor(Math.random() * 1000);
  
  game.players[seatIndex] = {
    id: botId,
    username: `Bot ${botNumber}`,
    avatar: '/bot-avatar.jpg',
    type: 'bot',
    position: seatIndex
  };
  
  // Send system message
  io.to(game.id).emit('system_message', {
    message: `A bot was invited to seat ${seatIndex + 1}`,
    type: 'info'
  });
  
  // Update all clients
  const enrichedGame = enrichGameForClient(game);
  console.log(`[BOT INVITATION] Emitting game_update after bot addition:`, {
    gameId: game.id,
    currentPlayerIndex: enrichedGame.play?.currentPlayerIndex,
    players: enrichedGame.players.map((p, i) => `${i}: ${p ? `${p.username} (${p.type})` : 'null'}`),
    hands: enrichedGame.hands?.map((h, i) => `${i}: ${h?.length || 0} cards`)
  });
  io.to(game.id).emit('game_update', enrichedGame);
  
  console.log(`[BOT INVITATION] Bot added to seat ${seatIndex} in game ${game.id}`);
  
  // Check if it's the bot's turn to play
  if (game.play && game.play.currentPlayerIndex === seatIndex) {
    console.log(`[BOT INVITATION] Bot at seat ${seatIndex} is current player, triggering bot play`);
    setTimeout(() => {
      botPlayCard(game, seatIndex);
    }, 1000); // 1 second delay
  }
  
  // Check if only bots remain after adding this bot
  const remainingHumanPlayers = game.players.filter(p => p && p.type === 'human');
  if (remainingHumanPlayers.length === 0) {
    console.log('[BOT INVITATION] No human players remaining after bot addition, closing game');
    // Remove game from games array
    const gameIndex = games.findIndex(g => g.id === game.id);
    if (gameIndex !== -1) {
      games.splice(gameIndex, 1);
    }
    // Notify all clients that game is closed
    io.to(game.id).emit('game_closed', { reason: 'no_humans_remaining' });
    return;
  }
}

async function fillSeatWithBot(game: Game, seatIndex: number) {
  const replacementId = `${game.id}-${seatIndex}`;
  const replacement = seatReplacements.get(replacementId);
  
  if (!replacement) {
    console.log(`[SEAT REPLACEMENT] No replacement found for ${replacementId}`);
    return;
  }
  
  // Clear the replacement
  seatReplacements.delete(replacementId);
  
  // Check if seat is still empty
  if (game.players[seatIndex] !== null) {
    console.log(`[SEAT REPLACEMENT] Seat ${seatIndex} is no longer empty`);
    return;
  }
  
  // Create bot
  const botId = `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const botNumber = Math.floor(Math.random() * 1000);
  
  game.players[seatIndex] = {
    id: botId,
    username: `Bot ${botNumber}`,
    avatar: '/bot-avatar.jpg',
    type: 'bot',
    position: seatIndex
  };
  
  // Send system message
  io.to(game.id).emit('system_message', {
    message: `A bot was automatically added to seat ${seatIndex + 1}`,
    type: 'info'
  });
  
  // Update all clients
  const enrichedGame = enrichGameForClient(game);
  console.log(`[SEAT REPLACEMENT] Emitting game_update after bot addition:`, {
    gameId: game.id,
    currentPlayerIndex: enrichedGame.play?.currentPlayerIndex,
    players: enrichedGame.players.map((p, i) => `${i}: ${p ? `${p.username} (${p.type})` : 'null'}`),
    hands: enrichedGame.hands?.map((h, i) => `${i}: ${h?.length || 0} cards`)
  });
  io.to(game.id).emit('game_update', enrichedGame);
  
  console.log(`[SEAT REPLACEMENT] Bot added to seat ${seatIndex} in game ${game.id}`);
  
  // FORCE GAME LOGGING - Create game in database immediately
  if (!game.dbGameId) {
    try {
      const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date();
      
      // Find a valid human player for creatorId, or use null if no humans
      const humanPlayer = game.players.find(p => p && p.type === 'human');
      const creatorId = humanPlayer?.id || null;
      
      const dbGame = await prisma.game.create({
        data: {
          id: gameId,
          creatorId: creatorId,
          gameMode: game.gameMode,
          bidType: 'REGULAR',
          specialRules: [],
          minPoints: game.minPoints,
          maxPoints: game.maxPoints,
          buyIn: game.buyIn,
          rated: game.players.filter(p => p && p.type === 'human').length === 4,
          status: 'PLAYING',
          createdAt: now,
          updatedAt: now
        } as any
      });
      
      game.dbGameId = dbGame.id;
      console.log(`[SEAT REPLACEMENT] Game forced to database with ID: ${game.dbGameId}`);
      await prisma.$disconnect();
    } catch (err) {
      console.error('[SEAT REPLACEMENT] Failed to force log game to database:', err);
    }
  }
  
  // Check if it's the bot's turn to play
  if (game.play && game.play.currentPlayerIndex === seatIndex) {
    console.log(`[SEAT REPLACEMENT] Bot at seat ${seatIndex} is current player, triggering bot play`);
    setTimeout(() => {
      botPlayCard(game, seatIndex);
    }, 1000); // 1 second delay
  }
  
  // Check if only bots remain after adding this bot
  const remainingHumanPlayers = game.players.filter(p => p && p.type === 'human');
  if (remainingHumanPlayers.length === 0) {
    console.log('[SEAT REPLACEMENT] No human players remaining after bot addition, closing game');
    // Remove game from games array
    const gameIndex = games.findIndex(g => g.id === game.id);
    if (gameIndex !== -1) {
      games.splice(gameIndex, 1);
    }
    // Notify all clients that game is closed
    io.to(game.id).emit('game_closed', { reason: 'no_humans_remaining' });
    // Update lobby for all clients
    io.emit('games_updated', games);
    return;
  }
}

function startPlayAgainTimer(game: Game) {
  console.log(`[PLAY AGAIN] Starting 30-second timer for game ${game.id}`);
  
  // Clear any existing timer
  const existingTimer = playAgainTimers.get(game.id);
  if (existingTimer) {
    clearTimeout(existingTimer.timer);
  }
  
  // Set 30-second timer
  const expiresAt = Date.now() + 30000; // 30 seconds
  const timer = setTimeout(() => {
    console.log(`[PLAY AGAIN] Timer expired for game ${game.id}, auto-removing non-responding players`);
    
    // For league games, never auto-remove players after play-again
    if ((game as any).league) {
      console.log('[PLAY AGAIN] League game detected; skipping auto-removal of non-responding players');
      // Clear timer and responses
      playAgainTimers.delete(game.id);
      playAgainResponses.delete(game.id);
      // Optionally, we could reset the game for a new round without removing players
      resetGameForNewRound(game);
      return;
    }
    
    // Get human players who didn't respond
    const humanPlayers = game.players.filter(p => p && p.type === 'human');
    const responses = playAgainResponses.get(game.id) || new Set();
    const nonRespondingPlayers = humanPlayers.filter(p => !responses.has(p!.id));
    
    // Remove non-responding players
    nonRespondingPlayers.forEach(player => {
      const playerIndex = game.players.findIndex(p => p && p.id === player!.id);
      if (playerIndex !== -1) {
        console.log(`[PLAY AGAIN] Auto-removing player ${player!.username} from game ${game.id}`);
        game.players[playerIndex] = null;
        
        // Start seat replacement for the empty seat
        startSeatReplacement(game, playerIndex);
      }
    });
    
    // Clear timer and responses
    playAgainTimers.delete(game.id);
    playAgainResponses.delete(game.id);
    
    // Check if any human players remain
    const remainingHumanPlayers = game.players.filter(p => p && p.type === 'human');
    if (remainingHumanPlayers.length === 0) {
      console.log(`[PLAY AGAIN] No human players remaining in game ${game.id}, closing game`);
      const gameIndex = games.findIndex(g => g.id === game.id);
      if (gameIndex !== -1) {
        games.splice(gameIndex, 1);
      }
      io.to(game.id).emit('game_closed', { reason: 'no_humans_remaining' });
      return;
    }
    
    // Reset game for remaining players
    resetGameForNewRound(game);
  }, 30000);
  
  playAgainTimers.set(game.id, { gameId: game.id, timer, expiresAt });
}

function resetGameForNewRound(game: Game) {
  console.log(`[PLAY AGAIN] Resetting game ${game.id} for new round`);
  
  // Clear play again timer and responses
  const timer = playAgainTimers.get(game.id);
  if (timer) {
    clearTimeout(timer.timer);
    playAgainTimers.delete(game.id);
  }
  playAgainResponses.delete(game.id);
  
  // Reset game state to WAITING
  game.status = 'WAITING';
  game.play = undefined;
  game.bidding = undefined;
  game.hands = undefined;
  game.team1TotalScore = 0;
  game.team2TotalScore = 0;
  game.team1Bags = 0;
  game.team2Bags = 0;
  game.playerBags = [0, 0, 0, 0];
  game.winningTeam = undefined;
  game.winningPlayer = undefined;
  game.playerScores = undefined;
  game.dealerIndex = undefined;
  game.isBotGame = game.players.filter(p => p && p.type === 'bot').length > 0;
  
  // Remove any bots that were added during the game and reset player trick counts
  game.players = game.players.map(p => {
    if (p && p.type === 'bot') {
      return null; // Remove bots
    }
    if (p) {
      // Reset trick count for human players
      p.tricks = 0;
    }
    return p;
  });
  
  // Send system message
  io.to(game.id).emit('system_message', {
    message: 'Game reset for new round',
    type: 'info'
  });
  
  // Update all clients
  io.to(game.id).emit('game_update', enrichGameForClient(game));
  io.emit('games_updated', games);
  
  console.log(`[PLAY AGAIN] Game ${game.id} reset successfully`);
}

// Session management functions
function createUserSession(userId: string): string {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Invalidate any existing session for this user
  const existingSessionId = userSessions.get(userId);
  if (existingSessionId) {
    sessionToUser.delete(existingSessionId);
    
    // Notify the old session that it's been invalidated
    const oldSocket = authenticatedSockets.get(userId);
    if (oldSocket) {
      oldSocket.emit('session_invalidated', {
        reason: 'new_login',
        message: 'You have logged in to your account on another device and have been logged out here'
      });
      oldSocket.disconnect();
    }
  }
  
  // Create new session
  userSessions.set(userId, sessionId);
  sessionToUser.set(sessionId, userId);
  
  console.log(`[SESSION] Created new session for user ${userId}: ${sessionId}`);
  return sessionId;
}

function validateUserSession(userId: string, sessionId: string): boolean {
  const currentSessionId = userSessions.get(userId);
  return currentSessionId === sessionId;
}

function invalidateUserSession(userId: string) {
  const sessionId = userSessions.get(userId);
  if (sessionId) {
    sessionToUser.delete(sessionId);
    userSessions.delete(userId);
    console.log(`[SESSION] Invalidated session for user ${userId}: ${sessionId}`);
  }
}

// Inactivity management functions
function updateGameActivity(gameId: string) {
  // Clear existing timer
  const existingTimer = tableInactivityTimers.get(gameId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  
  // Set new timer
  const timer = setTimeout(() => {
    console.log(`[INACTIVITY] Game ${gameId} inactive for 10 minutes, closing table`);
    closeInactiveTable(gameId);
  }, INACTIVITY_TIMEOUT);
  
  tableInactivityTimers.set(gameId, timer);
}

function closeInactiveTable(gameId: string) {
  const game = games.find(g => g.id === gameId);
  if (!game) {
    console.log(`[INACTIVITY] Game ${gameId} not found, already closed`);
    return;
  }
  
  // Remove game from games array
  const gameIndex = games.findIndex(g => g.id === gameId);
  if (gameIndex !== -1) {
    games.splice(gameIndex, 1);
  }
  
  // Clear timer
  tableInactivityTimers.delete(gameId);
  
  // Notify all players that table was closed due to inactivity
  io.to(gameId).emit('table_inactive', { 
    reason: 'inactivity',
    message: 'Your table was closed due to inactivity.'
  });
  
  // Update lobby for all clients
  io.emit('games_updated', games);
  
  console.log(`[INACTIVITY] Table ${gameId} closed due to inactivity`);
}

// Start inactivity monitoring for all games
function startInactivityMonitoring() {
  console.log('[INACTIVITY] Starting inactivity monitoring system');
  
  // Check for inactive games every minute
  setInterval(() => {
    const now = Date.now();
    games.forEach(game => {
      if (game.status === 'WAITING' && game.lastActivity) {
        const timeSinceActivity = now - game.lastActivity;
        if (timeSinceActivity >= INACTIVITY_TIMEOUT) {
          console.log(`[INACTIVITY] Game ${game.id} has been inactive for ${Math.round(timeSinceActivity / 1000 / 60)} minutes`);
          closeInactiveTable(game.id);
        }
      }
    });
  }, 60000); // Check every minute
}

// Start inactivity monitoring
startInactivityMonitoring();

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

// --- Helper functions copied from games.routes.ts ---

// Helper to calculate partners hand score

function calculatePartnersHandScore(game: Game) {
  if (!game.bidding || !game.play) {
    throw new Error('Invalid game state for scoring');
  }
  const team1 = [0, 2];
  const team2 = [1, 3];
  let team1Bid = 0, team2Bid = 0, team1Tricks = 0, team2Tricks = 0;
  let team1Bags = 0, team2Bags = 0;
  let team1Score = 0, team2Score = 0;
  
  // Use the already updated player trick counts instead of recalculating
  const tricksPerPlayer = game.players.map(p => p?.tricks || 0);
  
  console.log('[SCORING DEBUG] Tricks per player:', tricksPerPlayer);
  console.log('[SCORING DEBUG] Total tricks:', tricksPerPlayer.reduce((a, b) => a + b, 0));
  
  // Calculate team tricks
  for (const i of team1) {
    team1Tricks += tricksPerPlayer[i];
  }
  for (const i of team2) {
    team2Tricks += tricksPerPlayer[i];
  }
  
  // Calculate team bids (excluding nil bids)
  for (const i of team1) {
    const bid = game.bidding.bids[i] ?? 0;
    if (bid !== 0 && bid !== -1) { // Nil bids don't count toward team bid
      team1Bid += bid;
    }
  }
  for (const i of team2) {
    const bid = game.bidding.bids[i] ?? 0;
    if (bid !== 0 && bid !== -1) { // Nil bids don't count toward team bid
      team2Bid += bid;
    }
  }
  
  console.log('[SCORING DEBUG] Team 1 bid:', team1Bid, 'tricks:', team1Tricks);
  console.log('[SCORING DEBUG] Team 2 bid:', team2Bid, 'tricks:', team2Tricks);
  
  // Team 1 scoring
  if (team1Tricks >= team1Bid) {
    team1Score += team1Bid * 10;
    team1Bags = team1Tricks - team1Bid;
    team1Score += team1Bags; // Bags are worth 1 point each
  } else {
    team1Score -= team1Bid * 10;
    team1Bags = 0; // No bags for failed bids
  }
  // Team 2 scoring
  if (team2Tricks >= team2Bid) {
    team2Score += team2Bid * 10;
    team2Bags = team2Tricks - team2Bid;
    team2Score += team2Bags; // Bags are worth 1 point each
  } else {
    team2Score -= team2Bid * 10;
    team2Bags = 0; // No bags for failed bids
  }
  
  // Nil and Blind Nil
  for (const i of [...team1, ...team2]) {
    const bid = game.bidding.bids[i];
    const tricks = tricksPerPlayer[i];
    if (bid === 0) { // Nil
      if (tricks === 0) {
        if (team1.includes(i)) team1Score += 100;
        else team2Score += 100;
      } else {
        if (team1.includes(i)) team1Score -= 100;
        else team2Score -= 100;
        // Bags for failed nil go to team
        if (team1.includes(i)) team1Bags += tricks;
        else team2Bags += tricks;
      }
    } else if (bid === -1) { // Blind Nil (use -1 for blind nil)
      if (tricks === 0) {
        if (team1.includes(i)) team1Score += 200;
        else team2Score += 200;
      } else {
        if (team1.includes(i)) team1Score -= 200;
        else team2Score -= 200;
        // Bags for failed blind nil go to team
        if (team1.includes(i)) team1Bags += tricks;
        else team2Bags += tricks;
      }
    }
  }
  
  // NOTE: Bag penalty is NOT applied here - it should be applied to running totals in the calling code
  // This function only calculates the hand score and new bags for this hand
  
  // Validate total tricks equals 13
  const totalTricks = tricksPerPlayer.reduce((a, b) => a + b, 0);
  if (totalTricks !== 13) {
    console.error(`[SCORING ERROR] Invalid trick count: ${totalTricks}. Expected 13 tricks total.`);
    console.error('[SCORING ERROR] Tricks per player:', tricksPerPlayer);
    console.error('[SCORING ERROR] Game play tricks:', game.play.tricks);
  }
  
  console.log('[SCORING DEBUG] Final scores - Team 1:', team1Score, 'Team 2:', team2Score);
  
  return {
    team1Score,
    team2Score,
    team1Bags,
    team2Bags,
    tricksPerPlayer,
  };
}

// --- Stats tracking per hand ---
async function updateHandStats(game: Game) {
  console.log('[UPDATE HAND STATS] Function called for game:', game.id);
  console.log('[UPDATE HAND STATS] Game players:', game.players.map(p => p ? { id: p.id, type: p.type, bid: p.bid, tricks: p.tricks } : null));
  
  // Check if this is an all-human game (no bots)
  const humanPlayers = game.players.filter(p => p && p.type === 'human');
  const isAllHumanGame = humanPlayers.length === 4;
  
  if (!isAllHumanGame) {
    console.log('Skipping hand stats update - not an all-human game');
    return;
  }
  
  console.log('Updating hand stats for all-human game');
  
  for (let i = 0; i < 4; i++) {
    const player = game.players[i];
    if (!player || player.type !== 'human') continue;
    const userId = player.id;
    if (!userId) continue; // Skip if no user ID
    
    // Calculate bags for this player for this hand
    // Get bid from game.bidding.bids array using player position
    const playerBid = game.bidding?.bids?.[i];
    const playerTricks = player.tricks || 0;
    
    console.log(`[UPDATE HAND STATS] Processing player ${userId}: bid=${playerBid}, tricks=${playerTricks}`);
    
    // Skip if no bid was made (bid is undefined/null)
    if (playerBid === undefined || playerBid === null) {
      console.log(`Skipping stats update for user ${userId} - no bid made`);
      continue;
    }
    
    // For nil and blind nil, all tricks count as bags if failed
    let bags = 0;
    if (playerBid === 0 || playerBid === -1) {
      // Nil or blind nil: all tricks count as bags if failed
      bags = playerTricks;
    } else {
      // Regular bid: only excess tricks count as bags
      bags = Math.max(0, playerTricks - playerBid);
    }
    
    try {
      // Handle nil tracking for this hand
      let nilBidIncrement = 0;
      let nilMadeIncrement = 0;
      let blindNilBidIncrement = 0;
      let blindNilMadeIncrement = 0;
      
      if (playerBid === 0) {
        // Regular nil bid
        nilBidIncrement = 1;
        if (playerTricks === 0) {
          // Successfully made nil
          nilMadeIncrement = 1;
        }
      } else if (playerBid === -1) {
        // Blind nil bid
        blindNilBidIncrement = 1;
        if (playerTricks === 0) {
          // Successfully made blind nil
          blindNilMadeIncrement = 1;
        }
      }
      
      // Get current stats to calculate bags per game
      const currentStats = await prisma.userStats.findUnique({
        where: { userId }
      });
      
      const currentGamesPlayed = currentStats?.gamesPlayed || 0;
      const currentTotalBags = currentStats?.totalBags || 0;
      const newTotalBags = currentTotalBags + bags;
      const newBagsPerGame = currentGamesPlayed > 0 ? newTotalBags / currentGamesPlayed : bags;
      
      // Update stats for this hand
      console.log(`[UPDATE HAND STATS] Attempting to update stats for user ${userId} with data:`, {
        totalBags: newTotalBags,
        bagsPerGame: newBagsPerGame,
        nilsBid: { increment: nilBidIncrement },
        nilsMade: { increment: nilMadeIncrement },
        blindNilsBid: { increment: blindNilBidIncrement },
        blindNilsMade: { increment: blindNilMadeIncrement }
      });
      
      await prisma.userStats.update({
        where: { userId },
        data: {
          totalBags: newTotalBags,
          bagsPerGame: newBagsPerGame,
          nilsBid: { increment: nilBidIncrement },
          nilsMade: { increment: nilMadeIncrement },
          blindNilsBid: { increment: blindNilBidIncrement },
          blindNilsMade: { increment: blindNilMadeIncrement }
        }
      });
      
      console.log(`Updated hand stats for user ${userId}: nilsBid+${nilBidIncrement}, nilsMade+${nilMadeIncrement}, blindNilsBid+${blindNilBidIncrement}, blindNilsMade+${blindNilMadeIncrement}, bags+${bags}`);
    } catch (err: any) {
      console.error('Failed to update hand stats for user', userId, err);
    }
  }
}

// --- Stats and coins update helper ---
async function updateStatsAndCoins(game: Game, winningTeamOrPlayer: number) {
  // Check if this is an all-human game (no bots)
  const humanPlayers = game.players.filter(p => p && p.type === 'human');
  const isAllHumanGame = humanPlayers.length === 4;
  
  if (!isAllHumanGame) {
    console.log('Skipping stats/coins update - not an all-human game');
    return;
  }
  
  console.log('Updating stats and coins for all-human game');
  
  for (let i = 0; i < 4; i++) {
    const player = game.players[i];
    if (!player || player.type !== 'human') continue;
    const userId = player.id;
    if (!userId) continue; // Skip if no user ID
    
    let isWinner = false;
    if (game.gameMode === 'SOLO') {
      // Solo mode: winningTeamOrPlayer is the winning player index
      isWinner = i === winningTeamOrPlayer;
    } else {
      // Partners mode: winningTeamOrPlayer is the winning team (1 or 2)
      isWinner = (winningTeamOrPlayer === 1 && (i === 0 || i === 2)) || (winningTeamOrPlayer === 2 && (i === 1 || i === 3));
    }
    
    // Calculate bags for this player
    const playerBid = player.bid || 0;
    const playerTricks = player.tricks || 0;
    
    // For nil and blind nil, all tricks count as bags if failed
    let bags = 0;
    if (playerBid === 0 || playerBid === -1) {
      // Nil or blind nil: all tricks count as bags if failed
      bags = playerTricks;
    } else {
      // Regular bid: only excess tricks count as bags
      bags = Math.max(0, playerTricks - playerBid);
    }
    
    try {
      // Update stats (nil tracking is now done per hand)
      const stats = await prisma.userStats.update({
        where: { userId },
        data: {
          gamesPlayed: { increment: 1 },
          gamesWon: { increment: isWinner ? 1 : 0 },
          // Mode-specific counters
          partnersGamesPlayed: { increment: game.gameMode === 'PARTNERS' ? 1 : 0 },
          partnersGamesWon: { increment: game.gameMode === 'PARTNERS' && isWinner ? 1 : 0 },
          soloGamesPlayed: { increment: game.gameMode === 'SOLO' ? 1 : 0 },
          soloGamesWon: { increment: game.gameMode === 'SOLO' && isWinner ? 1 : 0 }
        }
      });
      
      // Handle coin prizes only (buy-in was already debited at game start)
      const buyIn = game.buyIn || 0;
      if (buyIn > 0) {
        if (isWinner) {
          let prizeAmount = 0;
          const totalPot = buyIn * 4;
          const rake = Math.floor(totalPot * 0.1); // 10% rake
          const prizePool = totalPot - rake;
          
          if (game.gameMode === 'SOLO') {
            // Solo mode: 2nd place gets buy-in back, 1st place gets remainder
            const secondPlacePrize = buyIn;
            prizeAmount = prizePool - secondPlacePrize; // 1st place gets remainder
          } else {
            // Partners mode: winning team splits 90% of pot (2 winners)
            prizeAmount = Math.floor(prizePool / 2); // Each winner gets half of 90%
          }
          
          await prisma.user.update({
            where: { id: userId },
            data: { coins: { increment: prizeAmount } }
          });
          // Track coin aggregates - winners get prize amount, but net is prize minus buy-in
          await prisma.userStats.update({
            where: { userId },
            data: {
              totalCoinsWon: { increment: prizeAmount },
              totalCoinsLost: { increment: 0 },
              netCoins: { increment: prizeAmount - buyIn }
            }
          });
          
          console.log(`Awarded ${prizeAmount} coins to winner ${userId} (total pot: ${totalPot}, rake: ${rake}, prize pool: ${prizePool})`);
        } else {
          // Loser: count the buy-in as lost (already deducted at start)
          await prisma.userStats.update({
            where: { userId },
            data: {
              totalCoinsWon: { increment: 0 },
              totalCoinsLost: { increment: buyIn },
              netCoins: { decrement: buyIn }
            }
          });
        }
      }
      
      console.log(`Updated stats for user ${userId}: gamesPlayed+1, gamesWon+${isWinner ? 1 : 0}, bags+${bags}`);
    } catch (err: any) {
      console.error('Failed to update stats/coins for user', userId, err);
    }
  }
  
  // Ensure results logging + Discord embed for league games
  try {
    const { logCompletedGameToDbAndDiscord } = await import('./lib/gameLogger');
    await logCompletedGameToDbAndDiscord(game as any, winningTeamOrPlayer);
  } catch (e) {
    console.error('Post-completion logging failed:', e);
  }
}

// Helper to enrich game object for client - imported from games.routes.ts

function isNonNull<T>(value: T | null | undefined): value is T {
  return value != null;
}

// Helper to get active games (no null players)
function getActiveGames() {
  return games.filter(game => {
    // Filter out league games that are in waiting status
    if ((game as any).league && game.status === 'WAITING') {
      return false;
    }
    return game.players.every(player => player !== null);
  });
}

// Helper to emit game update to all players with their own hands
function emitGameUpdateToPlayers(game: Game) {
  // Send individual game updates to each player with their own hand
  for (const player of game.players.filter(isNonNull)) {
    const playerSocket = authenticatedSockets.get(player.id);
    if (playerSocket) {
      playerSocket.emit('game_update', enrichGameForClient(game, player.id));
    }
  }
}

// Start turn timeout for human players
export function startTurnTimeout(game: Game, playerIndex: number, phase: 'bidding' | 'playing') {
  console.log(`[TIMEOUT DEBUG] startTurnTimeout called for playerIndex: ${playerIndex}, phase: ${phase}`);
  const player = game.players[playerIndex];
  console.log(`[TIMEOUT DEBUG] Player found: ${player?.username}, type: ${player?.type}`);
  if (!player || player.type !== 'human') {
    console.log(`[TIMEOUT DEBUG] Not starting timeout - player is null or not human`);
    return;
  }
  
  const timeoutKey = `${game.id}-${player.id}`;
  
  console.log(`[TURN TIMEOUT DEBUG] Starting timeout for player ${player.username} (${player.id}) at seat ${playerIndex}, phase: ${phase}`);
  
  // Clear any existing timeout
  const existingTimeout = turnTimeouts.get(timeoutKey);
  if (existingTimeout) {
    console.log(`[TURN TIMEOUT DEBUG] Clearing existing timeout for ${player.username}, consecutive timeouts: ${existingTimeout.consecutiveTimeouts}`);
    clearTimeout(existingTimeout.timer);
  }
  
  // Start 20-second timer to show countdown overlay
  console.log(`[TURN TIMEOUT DEBUG] Starting 20-second timer for ${player.username} at seat ${playerIndex}, phase: ${phase}`);
  const countdownTimer = setTimeout(() => {
    console.log(`[TURN TIMEOUT] Player ${player.username} reached 20 seconds - showing countdown overlay`);
    
    // Emit countdown start event to show 10-second overlay
    io.to(game.id).emit('countdown_start', {
      playerId: player.id,
      playerIndex: playerIndex,
      timeLeft: 10
    });
    
    // Start 10-second countdown timer
    const finalTimer = setTimeout(() => {
      console.log(`[TURN TIMEOUT] Player ${player.username} timed out on ${phase} turn after 30 seconds total`);
      
      // Get current consecutive timeouts
      const currentTimeouts = turnTimeouts.get(timeoutKey);
      const consecutiveTimeouts = (currentTimeouts?.consecutiveTimeouts || 0) + 1;
      
      console.log(`[TURN TIMEOUT] Player ${player.username} consecutive timeouts: ${consecutiveTimeouts}`);
      
      // Bot acts for player (NEVER remove player - they can refresh and rejoin)
      console.log(`[TURN TIMEOUT] Bot acting for player ${player.username} (${consecutiveTimeouts} consecutive timeouts)`);
      if (phase === 'bidding') {
        console.log(`[TURN TIMEOUT] Calling botMakeMove for player ${player.username} at seat ${playerIndex}`);
        // Mark this as a bot action to prevent timeout clearing
        (game as any).botActionInProgress = true;
        botMakeMove(game, playerIndex);
        (game as any).botActionInProgress = false;
      } else if (phase === 'playing') {
        console.log(`[TURN TIMEOUT] Human player timed out in playing phase, acting for player ${player.username} at seat ${playerIndex}`);
        // Use the dedicated human timeout handler
        const { handleHumanTimeout } = require('./routes/games.routes');
        handleHumanTimeout(game, playerIndex);
      }
      
      // Clear the timeout timer but keep the consecutive count
      clearTurnTimeoutOnly(game, player.id);
      
      // Update consecutive timeouts (don't reset to 0)
      turnTimeouts.set(timeoutKey, { gameId: game.id, playerId: player.id, timer: null, consecutiveTimeouts });
      console.log(`[TURN TIMEOUT DEBUG] Updated timeout count for ${player.username}: ${consecutiveTimeouts}`);
    }, 10000); // 10 second countdown
    
    // Store the final timer
    turnTimeouts.set(timeoutKey, { gameId: game.id, playerId: player.id, timer: finalTimer, consecutiveTimeouts: existingTimeout?.consecutiveTimeouts || 0 });
    
  }, 20000); // 20 second initial timer
  
  // Initialize with current consecutive timeouts (don't reset to 0)
  const currentTimeouts = turnTimeouts.get(timeoutKey);
  const currentConsecutiveTimeouts = currentTimeouts?.consecutiveTimeouts || 0;
  turnTimeouts.set(timeoutKey, { gameId: game.id, playerId: player.id, timer: countdownTimer, consecutiveTimeouts: currentConsecutiveTimeouts });
  console.log(`[TURN TIMEOUT DEBUG] Set timeout for ${player.username} with consecutive timeouts: ${currentConsecutiveTimeouts}`);
}

// Clear turn timeout when player acts
export function clearTurnTimeout(game: Game, playerId: string) {
  const timeoutKey = `${game.id}-${playerId}`;
  const existingTimeout = turnTimeouts.get(timeoutKey);
  if (existingTimeout) {
    console.log(`[TURN TIMEOUT DEBUG] Clearing timeout for player ${playerId}, consecutive timeouts: ${existingTimeout.consecutiveTimeouts}`);
    clearTimeout(existingTimeout.timer);
    
    // Don't reset consecutive timeouts if this is a bot action
    if ((game as any).botActionInProgress) {
      console.log(`[TURN TIMEOUT DEBUG] Bot action in progress, keeping consecutive timeouts: ${existingTimeout.consecutiveTimeouts}`);
      turnTimeouts.set(timeoutKey, { gameId: game.id, playerId: playerId, timer: null, consecutiveTimeouts: existingTimeout.consecutiveTimeouts });
    } else {
      // Reset consecutive timeouts when player acts
      turnTimeouts.set(timeoutKey, { gameId: game.id, playerId: playerId, timer: null, consecutiveTimeouts: 0 });
      console.log(`[TURN TIMEOUT DEBUG] Reset consecutive timeouts to 0 for player ${playerId}`);
    }
  }
}

// Clear turn timeout without resetting consecutive count (for bot actions)
export function clearTurnTimeoutOnly(game: Game, playerId: string) {
  const timeoutKey = `${game.id}-${playerId}`;
  const existingTimeout = turnTimeouts.get(timeoutKey);
  if (existingTimeout) {
    clearTimeout(existingTimeout.timer);
    // Don't reset consecutive timeouts, just clear the timer
    turnTimeouts.set(timeoutKey, { gameId: game.id, playerId: playerId, timer: null, consecutiveTimeouts: existingTimeout.consecutiveTimeouts });
  }
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
  
  // REMOVED: Loading crashed games from database - this was causing duplicate tables
});

// Add helper to ensure leagueReady array exists
function ensureLeagueReady(game: any) {
	if (!Array.isArray(game.leagueReady) || game.leagueReady.length !== 4) {
		game.leagueReady = [false, false, false, false];
	}
}

// Periodic game completion check - runs every 10 seconds
setInterval(() => {
  games.forEach((game: Game) => {
    if (game.status === 'PLAYING') {
      const maxPoints = game.maxPoints;
      const minPoints = game.minPoints;
      
      if (maxPoints !== undefined && minPoints !== undefined) {
        if (game.gameMode === 'SOLO') {
          const playerScores = game.playerScores || [0, 0, 0, 0];
          const isGameOver = playerScores.some(score => score >= maxPoints || score <= minPoints);
          
          if (isGameOver) {
            console.log('[PERIODIC CHECK] Solo game ended! Player scores:', playerScores);
            game.status = 'FINISHED';
            
            let winningPlayer = 0;
            let highestScore = playerScores[0];
            for (let i = 1; i < playerScores.length; i++) {
              if (playerScores[i] > highestScore) {
                highestScore = playerScores[i];
                winningPlayer = i;
              }
            }
            
            io.to(game.id).emit('game_over', {
              playerScores: game.playerScores,
              winningPlayer: winningPlayer,
            });
            
            // Update stats and coins in DB
            updateStatsAndCoins(game, winningPlayer).catch(err => {
              console.error('Failed to update stats/coins:', err);
            });
            
            // Log completed game to DB and Discord
            void import('./lib/gameLogger')
              .then(({ logCompletedGameToDbAndDiscord }) => logCompletedGameToDbAndDiscord(game, winningPlayer))
              .catch((e) => console.error('Failed to log completed game (periodic check):', e));
          }
        } else {
          // Partners mode game over check
          let shouldEndGame = false;
          let winningTeam = null;
          
          // If either team is below minPoints, they lose immediately
          if (game.team1TotalScore <= minPoints) {
            shouldEndGame = true;
            winningTeam = 2;
          } else if (game.team2TotalScore <= minPoints) {
            shouldEndGame = true;
            winningTeam = 1;
          }
          // If either team is above maxPoints, check if they have a clear lead
          else if (game.team1TotalScore >= maxPoints) {
            if (game.team1TotalScore > game.team2TotalScore) {
              shouldEndGame = true;
              winningTeam = 1;
            }
          } else if (game.team2TotalScore >= maxPoints) {
            if (game.team2TotalScore > game.team1TotalScore) {
              shouldEndGame = true;
              winningTeam = 2;
            }
          }
          
          if (shouldEndGame && winningTeam) {
            console.log('[PERIODIC CHECK] Partners game ended! Team 1:', game.team1TotalScore, 'Team 2:', game.team2TotalScore, 'Winner:', winningTeam);
            game.status = 'FINISHED';
            io.to(game.id).emit('game_over', {
              team1Score: game.team1TotalScore,
              team2Score: game.team2TotalScore,
              winningTeam,
            });
            
            // Update stats and coins in DB
            updateStatsAndCoins(game, winningTeam).catch(err => {
              console.error('Failed to update stats/coins:', err);
            });
            
            // Log completed game to DB and Discord
            void import('./lib/gameLogger')
              .then(({ logCompletedGameToDbAndDiscord }) => logCompletedGameToDbAndDiscord(game, winningTeam))
              .catch((e) => console.error('Failed to log completed game (periodic check):', e));
          }
        }
      }
    } else if (game.status === 'HAND_COMPLETED') {
      // NEW: Fallback mechanism for games stuck in HAND_COMPLETED status
      // Check if game has been in HAND_COMPLETED status for more than 30 seconds
      const handCompletedTime = (game as any).handCompletedTime || 0;
      const timeSinceHandCompleted = Date.now() - handCompletedTime;
      
      if (timeSinceHandCompleted > 30000) { // 30 seconds
        console.log('[PERIODIC CHECK] Game stuck in HAND_COMPLETED status for 30+ seconds, auto-starting next hand:', game.id);
        
        // Auto-start next hand
        try {
          // Move dealer to the left (next position)
          game.dealerIndex = (game.dealerIndex + 1) % 4;
          
          // Reset game state for new hand
          game.status = 'BIDDING';
          game.bidding = {
            currentPlayer: game.players[game.dealerIndex]?.id || '',
            currentBidderIndex: game.dealerIndex,
            bids: [null, null, null, null],
            nilBids: {}
          };
          game.play = undefined;
          
          // Reset player states
          game.players.forEach(player => {
            if (player) {
              player.hand = [];
              player.bid = undefined;
              player.tricks = 0;
            }
          });
          
          // Deal new cards
          const hands = dealCards(game.players, game.dealerIndex);
          game.hands = hands;
          
          // Assign hands to players
          game.players.forEach((player, index) => {
            if (player) {
              player.hand = hands[index] || [];
            }
          });
          
          console.log('[PERIODIC CHECK] Auto-started new hand for game:', game.id);
          
          // Emit events
          io.to(game.id).emit('new_hand_started', {
            dealerIndex: game.dealerIndex,
            hands: game.players.map(p => p?.hand || [])
          });
          io.to(game.id).emit('bidding_ready', {
            currentPlayer: game.bidding.currentPlayer
          });
          io.to(game.id).emit('game_update', enrichGameForClient(game));
          
        } catch (error) {
          console.error('[PERIODIC CHECK] Failed to auto-start new hand:', error);
        }
      } else {
        // Check for game over while in HAND_COMPLETED status
        const maxPoints = game.maxPoints;
        const minPoints = game.minPoints;
        
        if (maxPoints !== undefined && minPoints !== undefined) {
          if (game.gameMode === 'SOLO') {
            const playerScores = game.playerScores || [0, 0, 0, 0];
            const isGameOver = playerScores.some(score => score >= maxPoints || score <= minPoints);
            
            if (isGameOver) {
              console.log('[PERIODIC CHECK] Solo game ended while in HAND_COMPLETED! Player scores:', playerScores);
              game.status = 'FINISHED';
              
              let winningPlayer = 0;
              let highestScore = playerScores[0];
              for (let i = 1; i < playerScores.length; i++) {
                if (playerScores[i] > highestScore) {
                  highestScore = playerScores[i];
                  winningPlayer = i;
                }
              }
              
              io.to(game.id).emit('game_over', {
                playerScores: game.playerScores,
                winningPlayer: winningPlayer,
              });
              
              updateStatsAndCoins(game, winningPlayer).catch(err => {
                console.error('Failed to update stats/coins:', err);
              });
              
              void import('./lib/gameLogger')
                .then(({ logCompletedGameToDbAndDiscord }) => logCompletedGameToDbAndDiscord(game, winningPlayer))
                .catch((e) => console.error('Failed to log completed game (periodic check):', e));
            }
          } else {
            // Partners mode game over check
            let shouldEndGame = false;
            let winningTeam = null;
            
            // If either team is below minPoints, they lose immediately
            if (game.team1TotalScore <= minPoints) {
              shouldEndGame = true;
              winningTeam = 2;
            } else if (game.team2TotalScore <= minPoints) {
              shouldEndGame = true;
              winningTeam = 1;
            }
            // If either team is above maxPoints, check if they have a clear lead
            else if (game.team1TotalScore >= maxPoints) {
              if (game.team1TotalScore > game.team2TotalScore) {
                shouldEndGame = true;
                winningTeam = 1;
              }
            } else if (game.team2TotalScore >= maxPoints) {
              if (game.team2TotalScore > game.team1TotalScore) {
                shouldEndGame = true;
                winningTeam = 2;
              }
            }
            
            if (shouldEndGame && winningTeam) {
              console.log('[PERIODIC CHECK] Partners game ended while in HAND_COMPLETED! Team 1:', game.team1TotalScore, 'Team 2:', game.team2TotalScore, 'Winner:', winningTeam);
              game.status = 'FINISHED';
              io.to(game.id).emit('game_over', {
                team1Score: game.team1TotalScore,
                team2Score: game.team2TotalScore,
                winningTeam,
              });
              
              updateStatsAndCoins(game, winningTeam).catch(err => {
                console.error('Failed to update stats/coins:', err);
              });
              
              void import('./lib/gameLogger')
                .then(({ logCompletedGameToDbAndDiscord }) => logCompletedGameToDbAndDiscord(game, winningTeam))
                .catch((e) => console.error('Failed to log completed game (periodic check):', e));
            }
          }
        }
      }
    }
  });
}, 10000); // Check every 10 seconds

// Single function to handle game completion
async function completeGame(game: Game, winningTeamOrPlayer: number) {
  console.log('[GAME COMPLETION] Completing game:', game.id, 'Winner:', winningTeamOrPlayer);
  
  // Set game status to FINISHED
  game.status = 'FINISHED';
  
  // Update database status to FINISHED
  if (game.dbGameId) {
    try {
      await prisma.game.update({
        where: { id: game.dbGameId },
        data: { status: 'FINISHED' }
      });
      console.log('[GAME COMPLETION] Updated database status to FINISHED for game:', game.dbGameId);
    } catch (error) {
      console.error('[GAME COMPLETION] Failed to update database status:', error);
    }
  }
  
  // Emit game over event
  if (game.gameMode === 'SOLO') {
    io.to(game.id).emit('game_over', {
      playerScores: game.playerScores,
      winningPlayer: winningTeamOrPlayer,
    });
  } else {
    io.to(game.id).emit('game_over', {
      team1Score: game.team1TotalScore,
      team2Score: game.team2TotalScore,
      winningTeam: winningTeamOrPlayer,
    });
  }
  
  // Start play again timer
  startPlayAgainTimer(game);
  
  // Update stats and coins in DB
  updateStatsAndCoins(game, winningTeamOrPlayer).catch(err => {
    console.error('Failed to update stats/coins:', err);
  });
  
  // Log completed game to DB and Discord for league games
  console.log('[GAME COMPLETION DEBUG] Game object league property:', (game as any).league);
  console.log('[GAME COMPLETION DEBUG] Game object keys:', Object.keys(game));
  void import('./lib/gameLogger')
    .then(({ logCompletedGameToDbAndDiscord }) => logCompletedGameToDbAndDiscord(game, winningTeamOrPlayer))
    .catch((e) => console.error('Failed to log completed game (fallback):', e));
}

// REMOVED: loadActiveGamesFromDatabase function - was causing duplicate tables and crashed games

// ... existing code ...