import { io, Socket } from 'socket.io-client';
import { apiFetch } from '@/lib/api';

// For WebSocket connections in production, we need to use wss:// instead of https://
const getWebSocketUrl = () => {
  console.log('getWebSocketUrl called with:', {
    VITE_SOCKET_URL: import.meta.env.VITE_SOCKET_URL,
    hostname: window.location.hostname,
    location: window.location.href
  });
  
  if (import.meta.env.VITE_SOCKET_URL) {
    const url = import.meta.env.VITE_SOCKET_URL.replace('https://', 'wss://').replace('http://', 'ws://');
    console.log('Using VITE_SOCKET_URL:', url);
    return url;
  }
  
  // Check if we're in production by looking at the current URL
  const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  console.log('Production check:', { hostname: window.location.hostname, isProduction });
  
  if (isProduction) {
    console.log('Returning production WebSocket URL: wss://bux-spades-server.fly.dev');
    return 'wss://bux-spades-server.fly.dev';
  }
  console.log('Returning development WebSocket URL: ws://localhost:3000');
  return 'ws://localhost:3000';
};

// Add SocketState interface
interface SocketState {
  isConnected: boolean;
  isAuthenticated: boolean;
  isReady: boolean;
  error: string | null;
}

export class SocketManager {
  private static instance: SocketManager;
  private socket: Socket | null = null;
  private state: SocketState = {
    isConnected: false,
    isAuthenticated: false,
    isReady: false,
    error: null
  };
  private session: { token: string; userId: string; username: string } | null = null;

  private stateChangeCallbacks: ((state: SocketState) => void)[] = [];
  private initialized = false;
  private onConnectCallbacks: (() => void)[] = [];

  private constructor() {
    // Private constructor to enforce singleton
  }

  public static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  public onStateChange(callback: (state: SocketState) => void) {
    this.stateChangeCallbacks.push(callback);
    // Immediately notify of current state
    callback(this.getState());
  }

  public onConnect(callback: () => void) {
    this.onConnectCallbacks.push(callback);
  }

  private notifyStateChange() {
    const state = this.getState();
    this.stateChangeCallbacks.forEach(callback => callback(state));
  }

  private notifyConnect() {
    this.onConnectCallbacks.forEach(callback => callback());
  }

  public getState(): SocketState {
    return {
      isConnected: this.state.isConnected,
      isAuthenticated: this.state.isAuthenticated,
      isReady: this.state.isReady,
      error: this.state.error
    };
  }

  public initialize(userId: string, username: string, avatar?: string): void {
    console.log('SocketManager: Initializing with user:', { userId, username });
    console.log('SocketManager: localStorage contents:', {
      sessionToken: localStorage.getItem('sessionToken'),
      userData: localStorage.getItem('userData'),
      token: localStorage.getItem('token')
    });
    
    // Get token from localStorage
    const token = localStorage.getItem('sessionToken') || localStorage.getItem('token');
    if (!token) {
      console.error('SocketManager: No session token found');
      this.state.isReady = false;
      this.notifyStateChange();
      return;
    }

    this.session = { token, userId, username };
    
    // If we already have a socket, disconnect it
    if (this.socket) {
      console.log('SocketManager: Disconnecting existing socket');
      this.socket.disconnect();
      this.socket = null;
    }

    // Initialize new socket connection with more robust settings
    const wsUrl = getWebSocketUrl();
    console.log('SocketManager: Environment check:', {
      hostname: window.location.hostname,
      isProduction: window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1',
      wsUrl: wsUrl
    });
    this.socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      auth: {
        token,
        userId,
        username,
        avatar
      },
      reconnection: true,
      reconnectionAttempts: 15, // Increased from 10
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000, // Increased from 5000
      timeout: 30000, // Increased from 20000
      autoConnect: true,
      forceNew: true, // Force new connection
      upgrade: true, // Allow transport upgrade
      rememberUpgrade: true,
      // Add more robust settings for page refresh scenarios
      closeOnBeforeunload: false // Don't close on page unload
    });

    this.setupSocketListeners();
    this.notifyStateChange();
    this.initialized = true;
  }

  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Socket connected successfully');
      this.state.isConnected = true;
      
      // If we have a session, authenticate immediately
      if (this.session) {
        this.socket?.emit('authenticate', {
          token: this.session.token,
          userId: this.session.userId,
          username: this.session.username
        });
      }
      
      this.notifyStateChange();
      this.notifyConnect();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      this.state.isConnected = false;
      this.state.isAuthenticated = false;
      this.state.isReady = false;
      
      // Let Socket.IO handle all reconnection automatically
      // No manual reconnection logic to interfere
      
      this.notifyStateChange();
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.state.error = error.message;
      this.notifyStateChange();
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('Socket reconnected after', attemptNumber, 'attempts');
      this.state.isConnected = true;
      
      // Re-authenticate after reconnection
      if (this.session) {
        console.log('SocketManager: Re-authenticating after reconnection');
        this.socket?.emit('authenticate', {
          token: this.session.token,
          userId: this.session.userId,
          username: this.session.username
        });
      }
      
      this.notifyStateChange();
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('Socket reconnection error:', error);
      this.state.error = error.message;
      this.notifyStateChange();
    });

    this.socket.on('reconnect_failed', () => {
      console.error('Socket reconnection failed after all attempts');
      this.state.error = 'Failed to reconnect after all attempts';
      this.notifyStateChange();
    });

    this.socket.on('authenticated', (data: { success: boolean; userId: string; games: any[] }) => {
      this.state.isAuthenticated = data.success;
      this.state.isReady = this.state.isConnected && this.state.isAuthenticated;
      this.notifyStateChange();
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      this.state.isReady = false;
      this.state.error = error.message;
      this.notifyStateChange();
    });

    this.socket.on('session_invalidated', (data: { reason: string; message: string }) => {
      console.log('Session invalidated:', data);
      this.state.isAuthenticated = false;
      this.state.isReady = false;
      this.state.error = 'Session invalidated';
      
      // Clear session data
      this.session = null;
      
      // Disconnect socket
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
      }
      
      this.notifyStateChange();
      
      // Dispatch custom event for AuthContext to handle
      window.dispatchEvent(new CustomEvent('sessionInvalidated', { detail: data }));
    });
  }

  public getSocket(): Socket | null {
    return this.socket;
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.state.isConnected = false;
    this.state.isAuthenticated = false;
    this.state.isReady = false;
    this.session = null;
    this.notifyStateChange();
  }

  public forceReconnect(): void {
    console.log('SocketManager: Force reconnecting...');
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    // Reset state
    this.state.isConnected = false;
    this.state.isAuthenticated = false;
    this.state.isReady = false;

    
    // Reinitialize if we have a session
    if (this.session) {
      console.log('SocketManager: Reinitializing with existing session');
      this.initialize(this.session.userId, this.session.username);
    }
    
    this.notifyStateChange();
  }

  public isInitialized(): boolean {
    return this.initialized;
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
      const response = await apiFetch('/api/auth/profile', {
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
        
        socketManager.initialize(sessionWithToken.user.id, sessionWithToken.user.username, sessionWithToken.user.avatar);
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