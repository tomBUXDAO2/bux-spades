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
    
    // Don't send authenticate event - server already authenticates during connection
    // The server will send 'authenticated' event after successful authentication
    
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
          console.log('[SOCKET MANAGER] Skipping auto-join - recently failed to join this game');
          return;
        }
        
        // Double-check that the game ID still exists (in case it was cleared by another event)
        const currentActiveGameId = localStorage.getItem('activeGameId');
        if (currentActiveGameId !== activeGameId) {
          console.log('[SOCKET MANAGER] Skipping auto-join - game ID was cleared by another event');
          return;
        }
        
        setTimeout(() => {
          // Triple-check before actually joining
          const finalActiveGameId = localStorage.getItem('activeGameId');
          if (finalActiveGameId === activeGameId && socket && socket.connected) {
            console.log('[SOCKET MANAGER] Auto-join on connect for game:', activeGameId);
            socket.emit('join_game', { gameId: activeGameId });
          } else {
            console.log('[SOCKET MANAGER] Skipping auto-join - game ID was cleared before timeout');
          }
        }, 200);
      }
    } catch {}
    
    callbacks.onConnect();
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    
    // Log disconnect details for debugging
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    console.log('Socket disconnect details:', {
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
          console.log('[SOCKET MANAGER] Skipping auto-join - recently failed to join this game');
          return;
        }
        
        console.log('[SOCKET MANAGER] Auto-join on authenticated for game:', activeGameId);
        socket.emit('join_game', { gameId: activeGameId });
      }
    } catch {}
    
    callbacks.onAuthenticated(data);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
    
    // If it's a "Game not found" error, clear the invalid game ID from localStorage
    if (error.message === 'Game not found') {
      console.log('[SOCKET MANAGER] Clearing invalid game ID from localStorage');
      const activeGameId = localStorage.getItem('activeGameId');
      if (activeGameId) {
        // Record this failed join attempt
        localStorage.setItem('lastFailedJoin', JSON.stringify({
          gameId: activeGameId,
          timestamp: Date.now()
        }));
      }
      localStorage.removeItem('activeGameId');
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
};
