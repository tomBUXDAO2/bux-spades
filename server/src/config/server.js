import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

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

// Socket.IO configuration
const io = new Server(server, {
  cors: corsOptions,
  path: '/socket.io',
  transports: ['polling', 'websocket']
});

const PORT = process.env.PORT || 3000;

export { app, server, io, PORT };
