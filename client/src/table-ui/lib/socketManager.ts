import { Manager } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { Session } from 'next-auth';

let socket: Socket | null = null;
let isInitialized = false;

export function getSocketManager() {
  return {
    initialize(session: Session) {
      if (!session?.user) {
        console.error('Cannot initialize socket: No user in session');
        return;
      }

      console.log('Initializing socket with session:', {
        userId: session.user.id,
        username: session.user.username,
        hasSessionToken: !!session.user.sessionToken
      });

      if (socket) {
        console.log('Socket already exists, disconnecting...');
        socket.disconnect();
      }

      const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
      console.log('Connecting to socket server:', socketUrl);

      const manager = new Manager(socketUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        auth: {
          userId: session.user.id,
          username: session.user.username,
          sessionToken: session.user.sessionToken
        }
      });

      socket = manager.socket('/');

      socket.on('connect', () => {
        console.log('Socket connected successfully');
        isInitialized = true;
      });

      socket.on('connect_error', (error: Error) => {
        console.error('Socket connection error:', error);
        isInitialized = false;
      });

      socket.on('disconnect', (reason: string) => {
        console.log('Socket disconnected:', reason);
        isInitialized = false;
      });

      return socket;
    },

    getSocket() {
      return socket;
    },

    isInitialized() {
      return isInitialized && !!socket?.connected;
    },

    disconnect() {
      if (socket) {
        socket.disconnect();
        socket = null;
        isInitialized = false;
      }
    }
  };
}

export function getSocket() {
  return socket;
}

export function initializeSocket(options: { userId: string; username: string; sessionToken?: string }) {
  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
  const manager = new Manager(socketUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    auth: {
      userId: options.userId,
      username: options.username,
      sessionToken: options.sessionToken
    }
  });
  socket = manager.socket('/');
  return socket;
}

export async function handleAuthenticatedSession() {
  const socketManager = getSocketManager();
  if (!socketManager.isInitialized()) {
    console.log('Socket not initialized, initializing...');
    const session = await fetch('/api/auth/session').then(res => res.json());
    if (session?.user) {
      socketManager.initialize(session);
    }
  }
} 