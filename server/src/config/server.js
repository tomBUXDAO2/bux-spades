import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import session from 'express-session';
import passport from './passport.js';

dotenv.config();

const app = express();
const server = createServer(app);

// CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://bux-spades.vercel.app',
    'https://bux-spades-git-main-tombuxdao.vercel.app'
  ],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

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

const PORT = process.env.PORT || 3000;

export { app, server, io, PORT };
