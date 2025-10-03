import { Socket } from 'socket.io-client';

export interface SocketState {
  isConnected: boolean;
  isAuthenticated: boolean;
  isReady: boolean;
  error: string | null;
}

export interface SocketManagerCallbacks {
  onStateChange: (state: SocketState) => void;
  onConnect: () => void;
  onAuthenticated: (data: { success: boolean; userId: string; games: any[] }) => void;
  onSessionInvalidated: (data: { reason: string; message: string }) => void;
  startHeartbeat: () => void;
  startConnectionQualityMonitor: () => void;
}

export const setupSocketListeners = (
  socket: Socket,
  callbacks: SocketManagerCallbacks
): void => {
  console.log('🔧 Setting up socket event listeners');
  console.log('🔧 Socket state:', {
    connected: socket.connected,
    id: socket.id,
    readyState: (socket as any).readyState
  });
  
  // Remove any existing listeners first
  socket.removeAllListeners();
  socket.on('connect', () => {
    console.log('SOCKET CONNECTED SUCCESSFULLY');
    
    // Log connection details for debugging
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    console.log('Socket connection established:', {
      isMobile,
      userAgent: navigator.userAgent,
      connectionState: socket?.connected,
      transport: socket?.io?.engine?.transport?.name
    });
    
    // Send authentication event with token
    const token = localStorage.getItem('sessionToken');
    if (token) {
      console.log('Sending socket authentication with token');
      socket.emit('authenticate', { token });
    } else {
      console.error('No token found for socket authentication');
    }
    
    // Best-effort: if we already have an active game id, attempt a room join after a short delay
    try {
      const activeGameId = localStorage.getItem('activeGameId');
      if (activeGameId && socket && socket.connected) {
        // Check if we've recently failed to join this game
        const lastFailedJoin = localStorage.getItem('lastFailedJoin');
        const lastFailedGameId = lastFailedJoin ? JSON.parse(lastFailedJoin).gameId : null;
        const lastFailedTime = lastFailedJoin ? JSON.parse(lastFailedJoin).timestamp : 0;
        const timeSinceLastFail = Date.now() - lastFailedTime;
        
        // Don't retry if we failed to join this same game in the last 30 seconds
        if (lastFailedGameId === activeGameId && timeSinceLastFail < 30000) {
          return;
        }
        
        // Double-check that the game ID still exists (in case it was cleared by another event)
        const currentActiveGameId = localStorage.getItem('activeGameId');
        if (currentActiveGameId !== activeGameId) {
          return;
        }
        
        setTimeout(() => {
          // Triple-check before actually joining
          const finalActiveGameId = localStorage.getItem('activeGameId');
          if (finalActiveGameId === activeGameId && socket && socket.connected) {
            socket.emit('join_game', { gameId: activeGameId });
          } else {
          }
        }, 200);
      }
    } catch {}
    
    callbacks.onConnect();
  });

  // Handle authentication response
  socket.on('authenticated', (data) => {
    console.log('Socket authenticated successfully:', data);
    callbacks.onAuthenticated(data);
  });

  socket.on('auth_error', (error) => {
    console.error('Socket authentication error:', error);
    callbacks.onStateChange({
      isConnected: true,
      isAuthenticated: false,
      isReady: false,
      error: error.message
    });
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 SOCKET DISCONNECTED:', reason);
    
    // Log disconnect details for debugging
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    console.log('🔌 Socket disconnect details:', {
      reason,
      isMobile,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString()
    });
    
    // Let Socket.IO handle all reconnection automatically
    // No manual reconnection logic to interfere
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
  });

  socket.on('reconnect', (attemptNumber) => {
    console.log('Socket reconnected after', attemptNumber, 'attempts');
    
    // Log reconnection details for debugging
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    console.log('Socket reconnection details:', {
      attemptNumber,
      isMobile,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString()
    });
    
    // Don't re-authenticate - server will handle authentication on reconnection
    // The server will send 'authenticated' event after successful re-authentication
    
    // Restart heartbeat for mobile devices
    if (isMobile) {
      callbacks.startHeartbeat();
    }
  });

  socket.on('reconnect_error', (error) => {
    console.error('Socket reconnection error:', error);
  });

  socket.on('reconnect_failed', () => {
    console.error('Socket reconnection failed after all attempts');
  });

  socket.on('authenticated', (data: { success: boolean; userId: string; games: any[] }) => {
    console.log('SOCKET AUTHENTICATED:', data);
    
    // Start heartbeat and connection monitoring for mobile devices
    callbacks.startHeartbeat();
    callbacks.startConnectionQualityMonitor();
    
    // Ensure we are in the current game room post-auth
    try {
      const activeGameId = localStorage.getItem('activeGameId');
      if (activeGameId && socket && socket.connected) {
        // Check if we've recently failed to join this game
        const lastFailedJoin = localStorage.getItem('lastFailedJoin');
        const lastFailedGameId = lastFailedJoin ? JSON.parse(lastFailedJoin).gameId : null;
        const lastFailedTime = lastFailedJoin ? JSON.parse(lastFailedJoin).timestamp : 0;
        const timeSinceLastFail = Date.now() - lastFailedTime;
        
        // Don't retry if we failed to join this same game in the last 30 seconds
        if (lastFailedGameId === activeGameId && timeSinceLastFail < 30000) {
          return;
        }
        
        socket.emit('join_game', { gameId: activeGameId });
      }
    } catch {}
    
    callbacks.onAuthenticated(data);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
    
    // If it's a "Game not found" error, clear the invalid game ID from localStorage
    const lower = String(error?.message || '').toLowerCase();
    if (error.message === 'Game not found' || lower.includes('not a member') || lower.includes('failed to join')) {
      const activeGameId = localStorage.getItem('activeGameId');
      if (activeGameId) {
        // Record this failed join attempt
        localStorage.setItem('lastFailedJoin', JSON.stringify({
          gameId: activeGameId,
          timestamp: Date.now()
        }));
      }
      localStorage.removeItem('activeGameId');
      // Proactively notify UI with the affected gameId if available
      window.dispatchEvent(new CustomEvent('gameError', { detail: { message: error?.message || 'error', gameId: activeGameId } }));
      return;
    }
    
    // Don't disconnect on error - let Socket.IO handle reconnection
    console.log('Socket error occurred, letting Socket.IO handle reconnection');
  });

  socket.on('session_invalidated', (data: { reason: string; message: string }) => {
    console.log('Session invalidated:', data);
    
    // Dispatch custom event for AuthContext to handle
    window.dispatchEvent(new CustomEvent('sessionInvalidated', { detail: data }));
    
    callbacks.onSessionInvalidated(data);
  });

  // Debug: Log all socket events
  const originalEmit = socket.emit;
  socket.emit = function(...args: any[]) {
    console.log('📤 SOCKET EMIT:', args[0], args[1]);
    return originalEmit.apply(this, args as any);
  };
  
  // Debug: Log when listeners are removed
  const originalRemoveAllListeners = socket.removeAllListeners;
  socket.removeAllListeners = function() {
    console.log('🔧 REMOVING ALL SOCKET LISTENERS');
    console.trace('🔧 Stack trace for removeAllListeners');
    return originalRemoveAllListeners.apply(this);
  };


  // game_joined handled in useSocketEventHandlers.ts

  // Chat event listeners
  socket.on('game_message', (data: any) => {
    console.log('💬 GAME MESSAGE RECEIVED:', data);
    window.dispatchEvent(new CustomEvent('gameMessage', { detail: data }));
  });

  socket.on('game_messages', (data: any) => {
    console.log('💬 GAME MESSAGES RECEIVED:', data);
    window.dispatchEvent(new CustomEvent('gameMessages', { detail: data }));
  });

  socket.on('system_message', (data: any) => {
    console.log('🔔 SYSTEM MESSAGE RECEIVED:', data);
    window.dispatchEvent(new CustomEvent('systemMessage', { detail: data }));
  });

  // game_update handled in useSocketEventHandlers.ts

  socket.on('bidding_update', (data: any) => {
    console.log('Bidding update:', data);
    window.dispatchEvent(new CustomEvent('biddingUpdate', { detail: data }));
  });

  // Card played handled in useSocketEventHandlers.ts

  // Trick completion handled in GameEventHandlers.tsx

  socket.on('trick_started', (data: any) => {
    console.log('Trick started:', data);
    window.dispatchEvent(new CustomEvent('trickStarted', { detail: data }));
  });

  socket.on('round_started', (data: any) => {
    console.log('Round started:', data);
    window.dispatchEvent(new CustomEvent('roundStarted', { detail: data }));
  });

  // Round completion handled in GameEventHandlers.tsx

  // Game completion handled in GameEventHandlers.tsx

  socket.on('player_joined', (data: any) => {
    console.log('Player joined:', data);
    window.dispatchEvent(new CustomEvent('playerJoined', { detail: data }));
  });

  socket.on('player_left', (data: any) => {
    console.log('Player left:', data);
    window.dispatchEvent(new CustomEvent('playerLeft', { detail: data }));
  });

  socket.on('game_started', (data: any) => {
    console.log('Game started:', data);
    window.dispatchEvent(new CustomEvent('gameStarted', { detail: data }));
  });
};
