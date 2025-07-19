import { io, Socket } from 'socket.io-client';

// Get the socket URL from environment variables or use default
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

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
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stateChangeCallbacks: ((state: SocketState) => void)[] = [];
  private initialized = false;

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

  private notifyStateChange() {
    const state = this.getState();
    this.stateChangeCallbacks.forEach(callback => callback(state));
  }

  public getState(): SocketState {
    return {
      isConnected: this.state.isConnected,
      isAuthenticated: this.state.isAuthenticated,
      isReady: this.state.isReady,
      error: this.state.error
    };
  }

  public initialize(userId: string, username: string): void {
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
    console.log('SocketManager: Connecting to', SOCKET_URL);
    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      auth: {
        token,
        userId,
        username
      },
      reconnection: true,
      reconnectionAttempts: 10, // Increased from 5
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000, // Increased from 10000
      autoConnect: true,
      forceNew: true, // Force new connection
      upgrade: true, // Allow transport upgrade
      rememberUpgrade: true
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
      this.reconnectAttempts = 0;
      
      // If we have a session, authenticate immediately
      if (this.session) {
        console.log('SocketManager: Authenticating with session');
        this.socket?.emit('authenticate', {
          token: this.session.token,
          userId: this.session.userId,
          username: this.session.username
        });
      }
      
      this.notifyStateChange();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      this.state.isConnected = false;
      this.state.isAuthenticated = false;
      this.state.isReady = false;
      
      // Clear any existing reconnect timer
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      // Attempt to reconnect if we have a session
      if (this.session && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectAttempts++;
          console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          this.socket?.connect();
        }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts));
      }
      
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
      this.reconnectAttempts = 0;
      
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
      console.log('Socket authenticated:', data);
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
        
        socketManager.initialize(sessionWithToken.user.id, sessionWithToken.user.username);
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