import { io, Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;
let isInitialized = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let pendingAuth = false;
let connectionTimeout: NodeJS.Timeout | null = null;

export function getSocketManager() {
  return {
    initialize(session: any) {
      if (!session?.user) {
        console.error('Cannot initialize socket: No user in session');
        return;
      }

      if (pendingAuth) {
        console.log('Authentication already in progress, skipping initialization');
        return;
      }

      console.log('Initializing socket with session:', {
        userId: session.user.id,
        username: session.user.username,
        hasSessionToken: !!session.user.sessionToken
      });

      if (socketInstance?.connected) {
        console.log('Socket already connected, skipping initialization');
        return;
      }

      if (socketInstance) {
        console.log('Socket exists but not connected, disconnecting...');
        socketInstance.disconnect();
        socketInstance = null;
        isInitialized = false;
      }

      // Use proxy by setting URL to root
      const SOCKET_URL = '/';
      console.log('Connecting to socket server:', SOCKET_URL);

      // Clear any existing connection timeout
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
      }

      socketInstance = io(SOCKET_URL, {
        auth: {
          userId: session.user.id,
          username: session.user.username,
          token: session.user.sessionToken
        },
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        path: '/socket.io',
        withCredentials: true,
        forceNew: true,
        autoConnect: true,
        extraHeaders: {
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      // Set a connection timeout
      connectionTimeout = setTimeout(() => {
        if (socketInstance && !socketInstance.connected) {
          console.log('Connection timeout, retrying with polling only');
          socketInstance.io.opts.transports = ['polling'];
          socketInstance.connect();
        }
      }, 5000);

      socketInstance.on('connect', () => {
        console.log('Socket connected successfully');
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
          connectionTimeout = null;
        }
        reconnectAttempts = 0;
        
        // Only authenticate if not already authenticated
        if (session.user.id && !pendingAuth && !isInitialized) {
          pendingAuth = true;
          console.log('Emitting authenticate event');
          socketInstance?.emit('authenticate', {
            userId: session.user.id,
            token: session.user.sessionToken
          });
        }
      });

      socketInstance.on('authenticated', (data) => {
        console.log('Socket authenticated:', data);
        pendingAuth = false;
        if (data.success && data.userId === session.user.id) {
          isInitialized = true;
          // Only join games after authenticated
          if (data.games) {
            data.games.forEach((gameId: string) => {
              console.log('Joining existing game:', gameId);
              socketInstance?.emit('join_game', { gameId });
            });
          }
        } else {
          console.error('Authentication failed:', data);
          socketInstance?.disconnect();
        }
      });

      socketInstance.on('error', (error: { message: string }) => {
        console.error('Socket error:', error.message);
        if (error.message === 'Not authenticated' && !pendingAuth && !isInitialized) {
          pendingAuth = true;
          console.log('Re-authenticating...');
          socketInstance?.emit('authenticate', {
            userId: session.user.id,
            token: session.user.sessionToken
          });
        }
      });

      socketInstance.on('connect_error', (error: Error) => {
        console.error('Socket connection error:', error);
        pendingAuth = false;
        reconnectAttempts++;
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.error('Max reconnection attempts reached');
          socketInstance?.disconnect();
          socketInstance = null;
          isInitialized = false;
        } else {
          // Try polling if websocket fails
          if (Array.isArray(socketInstance?.io.opts.transports) && socketInstance.io.opts.transports.includes('websocket' as any)) {
            console.log('Switching to polling transport');
            socketInstance.io.opts.transports = ['polling'];
            socketInstance.connect();
          }
        }
      });

      socketInstance.on('disconnect', (reason: string) => {
        console.log('Socket disconnected:', reason);
        pendingAuth = false;
        isInitialized = false;
        if (reason === 'io server disconnect' || reason === 'transport close') {
          socketInstance = null;
          setTimeout(() => {
            if (!socketInstance) {
              console.log('Attempting to reconnect...');
              this.initialize(session);
            }
          }, 1000);
        }
      });

      return socketInstance;
    },

    getSocket() {
      return socketInstance;
    },

    isInitialized() {
      return isInitialized && !!socketInstance?.connected;
    },

    disconnect() {
      if (socketInstance) {
        socketInstance.disconnect();
        socketInstance = null;
        isInitialized = false;
        pendingAuth = false;
        reconnectAttempts = 0;
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
          connectionTimeout = null;
        }
      }
    }
  };
}

export const getSocket = (): Socket | null => {
  return socketInstance;
};

export const disconnectSocket = () => {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
    pendingAuth = false;
    reconnectAttempts = 0;
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
      connectionTimeout = null;
    }
  }
};

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