import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import session from 'express-session';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import passport from './passport.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadsRoot)) {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}

const app = express();

// Register before heavy middleware so Fly proxy / health checks succeed while the rest of the app loads.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const server = createServer(app);

// CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://bux-spades.vercel.app',
    'https://bux-spades-git-main-tombuxdao.vercel.app',
    'https://www.bux-spades.pro',
    'https://bux-spades.pro',
    // Capacitor native app (iOS/Android WebView)
    'capacitor://localhost',
    'ionic://localhost',
    'http://localhost'
  ],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use('/uploads', express.static(uploadsRoot));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Socket.IO configuration
const io = new Server(server, {
  cors: corsOptions,
  path: '/socket.io',
  transports: ['polling', 'websocket']
});

// Fly.io and other PaaS: must bind 0.0.0.0 (not localhost) for the proxy to reach the app.
const rawPort = process.env.PORT;
const PORT = Number.parseInt(String(rawPort ?? ''), 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

export { app, server, io, PORT, HOST };
