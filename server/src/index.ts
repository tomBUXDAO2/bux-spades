import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { syncAllDiscordUsers } from "./lib/discordSync";
import { createServer } from 'http';
import { Server } from 'socket.io';
import passport from 'passport';
import session from 'express-session';

import authRoutes from './routes/auth.routes';
import discordRoutes from './routes/discord.routes';
import gamesRoutes from './routes/games/games.routes';
import usersRoutes from './routes/users.routes';
import socialRoutes from './routes/social.routes';
import './config/passport';

// Import all modular functionality
import {
  setupErrorHandlers,
  initializeDiscordBot,
  setupSocketAuthentication,
  setupConnectionHandlers,
  initializeServer,
  authenticatedSockets,
  onlineUsers
} from './modules';

// Setup error handlers first
setupErrorHandlers();

// Initialize Discord bot
const discordBot = initializeDiscordBot();

const app = express();
const httpServer = createServer(app);

// CORS configuration
const httpAllowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://bux-spades.vercel.app',
  'https://bux-spades-git-main-tombuxdao.vercel.app',
  'https://www.bux-spades.pro',
  'https://bux-spades.pro'
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
    onlineUsers: onlineUsers.size
  });
});

// Setup socket authentication
setupSocketAuthentication(io);

// Setup connection handlers
setupConnectionHandlers(io, authenticatedSockets, onlineUsers);

const PORT = Number(process.env.PORT) || 3000;

// Initialize server
initializeServer(httpServer, PORT, io);

// Setup periodic Discord sync (every 30 minutes)
setInterval(async () => {
  try {
    await syncAllDiscordUsers();
  } catch (error) {
    console.error('[DISCORD SYNC] Error in periodic sync:', error);
  }
}, 30 * 60 * 1000); // 30 minutes

// Run initial sync after 5 minutes
setTimeout(async () => {
  try {
    console.log('[DISCORD SYNC] Running initial Discord sync...');
    await syncAllDiscordUsers();
  } catch (error) {
    console.error('[DISCORD SYNC] Error in initial sync:', error);
  }
}, 5 * 60 * 1000); // 5 minutes

// Manual Discord sync endpoint (for testing)
app.post('/api/sync-discord', async (req, res) => {
  try {
    console.log('[DISCORD SYNC] Manual sync requested');
    await syncAllDiscordUsers();
    res.json({ success: true, message: 'Discord sync completed' });
  } catch (error) {
    console.error('[DISCORD SYNC] Manual sync error:', error);
    res.status(500).json({ success: false, error: 'Sync failed' });
  }
});
