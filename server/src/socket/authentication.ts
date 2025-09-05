import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { syncDiscordUserData } from '../lib/discordSync';
import type { AuthenticatedSocket } from '../server';

// Session management
const userSessions = new Map<string, string>(); // userId -> sessionId
const sessionToUser = new Map<string, string>(); // sessionId -> userId

export function setupSocketAuthentication(io: any) {
  // Socket.IO connection handling
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;
      const userId = socket.handshake.auth.userId;
      const username = socket.handshake.auth.username;
      const avatar = socket.handshake.auth.avatar;

      if (!token || !userId || !username) {
        console.log('[AUTH] Missing required auth data');
        return next(new Error('Authentication failed: Missing required data'));
      }

      // Verify JWT token
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as any;
        if (decoded.userId !== userId) {
          console.log('[AUTH] Token userId mismatch');
          return next(new Error('Authentication failed: Token mismatch'));
        }
      } catch (jwtError) {
        console.log('[AUTH] JWT verification failed:', jwtError);
        return next(new Error('Authentication failed: Invalid token'));
      }

      // Check if user exists in database
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, avatar: true, discordId: true }
      });

      if (!user) {
        console.log('[AUTH] User not found in database');
        return next(new Error('Authentication failed: User not found'));
      }

      // Sync Discord data if needed
      if (user.discordId) {
        try {
          await syncDiscordUserData(user.discordId);
        } catch (syncError) {
          console.warn('[AUTH] Discord sync failed:', syncError);
        }
      }

      // Check for existing session
      const existingSessionId = userSessions.get(userId);
      if (existingSessionId) {
        console.log(`[AUTH] User ${userId} already has an active session, disconnecting old one`);
        const existingSocket = Array.from(io.sockets.sockets.values())
          .find((s: any) => s.id === existingSessionId) as AuthenticatedSocket;
        if (existingSocket) {
          existingSocket.disconnect(true);
        }
        userSessions.delete(userId);
        sessionToUser.delete(existingSessionId);
      }

      // Store session info
      socket.userId = userId;
      socket.isAuthenticated = true;
      socket.auth = { userId, username, token, avatar };
      
      userSessions.set(userId, socket.id);
      sessionToUser.set(socket.id, userId);

      console.log(`[AUTH] User ${username} (${userId}) authenticated successfully`);
      next();
    } catch (error) {
      console.error('[AUTH] Authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });
}

export { userSessions, sessionToUser };
