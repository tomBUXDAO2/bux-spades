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
        hasSessionToken: !!session.user.sessionToken,
        token: session.user.sessionToken
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
      const SOCKET_URL = import.meta.env.PROD 
        ? import.meta.env.VITE_PROD_API_URL 
        : '/';
      console.log('Connecting to socket server:', SOCKET_URL);

      // Clear any existing connection timeout
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
      }

      if (!session.user.sessionToken) {
        console.error('No session token available for socket connection');
        return;
      }

      socketInstance = io(SOCKET_URL, {
        auth: {
          userId: session.user.id,
          username: session.user.username,
          token: session.user.sessionToken
        },
        transports: ['websocket', 'polling'],
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
          'X-Requested-With': 'XMLHttpRequest',
          'Authorization': `Bearer ${session.user.sessionToken}`
        }
      });

      // Set a connection timeout
      connectionTimeout = setTimeout(() => {
        const socket = socketInstance;
        if (socket && !socket.connected) {
          console.log('Connection timeout, retrying with polling only');
          const opts = socket.io.opts;
          if (opts && Array.isArray(opts.transports)) {
            opts.transports = ['polling'];
            socket.connect();
          }
        }
      }, 5000);

      socketInstance.on('connect', () => {
        console.log('Socket connected successfully');
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
          connectionTimeout = null;
        }
        reconnectAttempts = 0;
        
        // Emit authenticate event immediately after connection
        const socket = socketInstance;
        if (socket && session.user.sessionToken) {
          console.log('Emitting authenticate event with token:', session.user.sessionToken);
          socket.emit('authenticate', {
            userId: session.user.id,
            token: session.user.sessionToken
          });
        }
      });

      socketInstance.on('authenticated', (data) => {
        console.log('Socket authenticated:', data);
        pendingAuth = false;
        const socket = socketInstance;
        if (data.success && data.userId === session.user.id) {
          isInitialized = true;
          // Only join games after authenticated
          if (data.games && socket) {
            data.games.forEach((gameId: string) => {
              console.log('Joining existing game:', gameId);
              socket.emit('join_game', { gameId });
            });
          }
        } else {
          console.error('Authentication failed:', data);
          // Clear invalid token
          localStorage.removeItem('token');
          socket?.disconnect();
        }
      });

      socketInstance.on('online_users', (onlineUserIds: string[]) => {
        console.log('Online users updated:', onlineUserIds);
        // Dispatch a custom event that components can listen to
        window.dispatchEvent(new CustomEvent('online_users_updated', { 
          detail: onlineUserIds 
        }));
      });

      socketInstance.on('error', (error: { message: string }) => {
        console.error('Socket error:', error.message);
        const socket = socketInstance;
        if (error.message === 'Not authenticated' && !pendingAuth && !isInitialized && socket) {
          pendingAuth = true;
          console.log('Re-authenticating...');
          if (session.user.sessionToken) {
            socket.emit('authenticate', {
              userId: session.user.id,
              token: session.user.sessionToken
            });
          } else {
            console.error('No session token available for re-authentication');
            localStorage.removeItem('token');
            socket.disconnect();
          }
        }
      });

      socketInstance.on('connect_error', (error: Error) => {
        console.error('Socket connection error:', error);
        const socket = socketInstance;
        console.log('Current socket state:', {
          connected: socket?.connected,
          id: socket?.id,
          auth: socket?.auth
        });
        pendingAuth = false;
        reconnectAttempts++;
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.error('Max reconnection attempts reached');
          socket?.disconnect();
          socketInstance = null;
          isInitialized = false;
        } else if (socket) {
          // Try polling if websocket fails
          const opts = socket.io.opts;
          if (opts && Array.isArray(opts.transports) && opts.transports.includes('websocket' as any)) {
            console.log('Switching to polling transport');
            opts.transports = ['polling'];
            socket.connect();
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
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No token found in localStorage');
      return;
    }
    
    try {
      console.log('Fetching profile with token:', token);
      const response = await fetch('/api/auth/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch profile: ${response.status}`);
      }
      
      const session = await response.json();
      
      if (session?.user) {
        // Create a proper session object with the token
        const sessionWithToken = {
          user: {
            ...session.user,
            sessionToken: token // Use the token from localStorage
          }
        };
        
        console.log('Session initialized with token:', {
          userId: sessionWithToken.user.id,
          username: sessionWithToken.user.username,
          hasToken: !!sessionWithToken.user.sessionToken,
          token: sessionWithToken.user.sessionToken // Log the actual token for debugging
        });
        
        socketManager.initialize(sessionWithToken);
      } else {
        console.error('Invalid session response:', session);
        // Clear invalid token
        localStorage.removeItem('token');
      }
    } catch (error) {
      console.error('Error fetching session:', error);
      // Clear token on error
      localStorage.removeItem('token');
    }
  }
} 