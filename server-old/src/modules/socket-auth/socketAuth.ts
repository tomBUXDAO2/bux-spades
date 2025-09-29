import jwt from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';
import prisma from '../../lib/prisma';

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  isAuthenticated?: boolean;
  auth?: { user: any };
}

export function setupSocketAuthentication(io: Server) {
  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as any;
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, username: true, avatarUrl: true, discordId: true }
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
}
