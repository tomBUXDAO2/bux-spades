import { io, Socket } from 'socket.io-client';

class SocketManager {
  private static instance: SocketManager | null = null;
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private connectionTimeout: NodeJS.Timeout | null = null;
  private storedToken: string | null = null;

  private constructor() {}

  static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  initialize(session: any): Socket | null {
    console.log('Initializing socket with session:', {
      userId: session.user.id,
      username: session.user.username,
      hasSessionToken: !!session.user.sessionToken,
      token: session.user.sessionToken
    });

    // Store the token for reconnection attempts
    if (session.user.sessionToken) {
      this.storedToken = session.user.sessionToken;
    }

    // If we have a stored token but no session token, use the stored token
    if (!session.user.sessionToken && this.storedToken) {
      session.user.sessionToken = this.storedToken;
    }

    if (!session.user.sessionToken) {
      console.error('No session token available for socket connection');
      return null;
    }

    if (this.socket?.connected) {
      console.log('Socket exists and is connected, reusing...');
      return this.socket;
    }

    if (this.socket) {
      console.log('Socket exists but not connected, disconnecting...');
      this.socket.disconnect();
    }

    // Use proxy by setting URL to root
    const SOCKET_URL = import.meta.env.PROD 
      ? import.meta.env.VITE_PROD_API_URL 
      : '/';
    console.log('Connecting to socket server:', SOCKET_URL);

    // Clear any existing connection timeout
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    const token = session.user.sessionToken;
    this.socket = io(SOCKET_URL, {
      auth: {
        userId: session.user.id,
        username: session.user.username,
        token: token
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      path: '/socket.io',
      withCredentials: true,
      forceNew: true,
      autoConnect: true,
      extraHeaders: {
        'Authorization': `Bearer ${token}`
      }
    });

    // Set a connection timeout
    this.connectionTimeout = setTimeout(() => {
      if (this.socket && !this.socket.connected) {
        console.log('Connection timeout, retrying with polling only');
        const opts = this.socket.io.opts;
        if (opts && Array.isArray(opts.transports)) {
          opts.transports = ['polling'];
          this.socket.connect();
        }
      }
    }, 5000);

    this.socket.on('connect', () => {
      console.log('Socket connected successfully');
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
      this.reconnectAttempts = 0;
      
      // Emit authenticate event immediately after connection
      if (this.socket && token) {
        console.log('Emitting authenticate event with token:', token);
        this.socket.emit('authenticate', {
          userId: session.user.id,
          username: session.user.username,
          token: token
        });
      }
    });

    this.socket.on('authenticated', (data) => {
      console.log('Socket authenticated:', data);
      if (data.success && data.userId === session.user.id && this.socket) {
        if (data.games) {
          data.games.forEach((gameId: string) => {
            console.log('Joining existing game:', gameId);
            this.socket?.emit('join_game', { gameId });
          });
        }
      } else {
        console.error('Authentication failed:', data);
        // Clear invalid token
        localStorage.removeItem('token');
        this.socket?.disconnect();
      }
    });

    this.socket.on('online_users', (onlineUserIds: string[]) => {
      console.log('Online users updated:', onlineUserIds);
      // Dispatch a custom event that components can listen to
      window.dispatchEvent(new CustomEvent('online_users_updated', { 
        detail: onlineUserIds 
      }));
    });

    this.socket.on('error', (error: { message: string }) => {
      console.error('Socket error:', error.message);
      if (error.message === 'Not authenticated' && this.reconnectAttempts < this.maxReconnectAttempts && this.socket) {
        this.reconnectAttempts++;
        console.log('Re-authenticating...');
        if (session.user.sessionToken) {
          this.socket.emit('authenticate', {
            userId: session.user.id,
            token: session.user.sessionToken
          });
        } else {
          console.error('No session token available for re-authentication');
          localStorage.removeItem('token');
          this.socket.disconnect();
        }
      }
    });

    this.socket.on('connect_error', (error: Error) => {
      console.error('Socket connection error:', error);
      console.log('Current socket state:', {
        connected: this.socket?.connected,
        id: this.socket?.id,
        auth: this.socket?.auth
      });
      this.reconnectAttempts++;
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
        this.socket?.disconnect();
        this.socket = null;
      } else if (this.socket) {
        // Try polling if websocket fails
        const opts = this.socket.io.opts;
        if (opts && Array.isArray(opts.transports) && opts.transports.includes('websocket' as any)) {
          console.log('Switching to polling transport');
          opts.transports = ['polling'];
          this.socket.connect();
        }
      }
    });

    this.socket.on('disconnect', (reason: string) => {
      console.log('Socket disconnected:', reason);
      if (reason === 'io server disconnect' || reason === 'transport close') {
        this.socket = null;
        setTimeout(() => {
          if (!this.socket) {
            console.log('Attempting to reconnect...');
            this.initialize(session);
          }
        }, 1000);
      }
    });

    return this.socket;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isInitialized(): boolean {
    return !!this.socket?.connected;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.reconnectAttempts = 0;
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
    }
  }
}

export const getSocketManager = () => {
  return SocketManager.getInstance();
};

export const getSocket = (): Socket | null => {
  const manager = getSocketManager();
  return manager.getSocket();
};

export const disconnectSocket = () => {
  const manager = getSocketManager();
  manager.disconnect();
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