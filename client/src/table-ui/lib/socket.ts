"use client";

import { useEffect, useRef, useState } from 'react';
import { Manager } from 'socket.io-client';
import type { GameState, Card, GameRules } from '@/types/game';
import { useSession } from 'next-auth/react';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

// Socket configuration
const socketConfig = {
  transports: ['websocket'],
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 30000,
  withCredentials: true,
  path: '/socket.io/',
  forceNew: true,
  auth: {
    token: typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
  }
};

export const useSocket = () => {
  const { data: session, status } = useSession();
  const [socket, setSocket] = useState<ReturnType<typeof Manager.prototype.socket> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<ReturnType<typeof Manager.prototype.socket> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Add detailed logging for session state
  useEffect(() => {
    console.log('Session status:', status);
    console.log('Session data:', session);
    
    if (session?.user) {
      console.log('User ID:', session.user.id);
      console.log('User name:', session.user.name);
    }
  }, [session, status]);

  useEffect(() => {
    // Only attempt to connect if we have a session and it's not loading
    if (status === 'loading') {
      console.log('Session is loading, waiting...');
      return;
    }

    if (status === 'unauthenticated' || !session?.user?.id) {
      console.log('No user session, skipping socket connection');
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    // If we already have a socket and it's connected, don't create a new one
    if (socketRef.current?.connected) {
      console.log('Socket already connected, skipping connection');
      return;
    }

    console.log('Attempting to connect to socket server with user ID:', session.user.id);
    
    // Create socket instance with updated auth token
    const authToken = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const manager = new Manager(SOCKET_URL, {
      ...socketConfig,
      auth: { token: authToken }
    });
    const newSocket = manager.socket('/');
    socketRef.current = newSocket;

    const handleConnect = () => {
      console.log('Socket connected');
      setIsConnected(true);
      setError(null);
      reconnectAttemptsRef.current = 0;
      
      // Clear any existing connection timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      
      // Authenticate the socket connection
      console.log('Authenticating socket with user ID:', session.user.id);
      newSocket.emit('authenticate', { 
        userId: session.user.id,
        token: authToken
      });
    };

    const handleDisconnect = (reason: string) => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
      
      // Only attempt reconnect if not manually disconnected
      if (reason !== 'io client disconnect' && reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        console.log(`Attempting reconnect (${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
        
        // Exponential backoff for reconnection
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
        setTimeout(() => {
          if (!newSocket.connected) {
            newSocket.connect();
          }
        }, delay);
      } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
        setError('Maximum reconnection attempts reached. Please refresh the page.');
      }
    };

    const handleError = (err: Error) => {
      console.error('Socket error:', err);
      setError(`Socket error: ${err.message}`);
      setIsConnected(false);
    };

    // Set a connection timeout
    connectionTimeoutRef.current = setTimeout(() => {
      if (!newSocket.connected) {
        console.log('Socket connection timeout');
        handleError(new Error('Connection timeout'));
      }
    }, socketConfig.timeout);

    newSocket.on('connect', handleConnect);
    newSocket.on('disconnect', handleDisconnect);
    newSocket.on('connect_error', handleError);
    newSocket.on('error', handleError);

    // Connect the socket
    newSocket.connect();
    setSocket(newSocket);

    return () => {
      console.log('Cleaning up socket connection');
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      if (newSocket) {
        newSocket.off('connect', handleConnect);
        newSocket.off('disconnect', handleDisconnect);
        newSocket.off('connect_error', handleError);
        newSocket.off('error', handleError);
        newSocket.disconnect();
      }
    };
  }, [session, status]);

  return { socket, isConnected, error };
};

// Helper function to explicitly join a game room
export function joinGameRoom(socket: ReturnType<typeof Manager.prototype.socket> | null, gameId: string) {
  if (!socket || !gameId) return;
  console.log(`Explicitly joining game room: ${gameId}`);
  socket.emit('join_room', { gameId });
}

// API Functions using socket
export function getGames(socket: ReturnType<typeof Manager.prototype.socket> | null, callback: (games: GameState[]) => void) {
  if (!socket) return () => {};
  
  const wrappedCallback = (games: GameState[]) => {
    console.log(`Received games_update with ${games.length} games`);
    callback(games);
  };

  socket.on('games_update', wrappedCallback);
  
  socket.on('game_update', (updatedGame: GameState) => {
    console.log(`Received game_update for game: ${updatedGame.id}`);
    socket.emit('get_games');
  });
  
  socket.on('game_over', (data: { team1Score: number, team2Score: number, winningTeam: 1 | 2, team1Bags: number, team2Bags: number }) => {
    console.log('Game over event received:', data);
    socket.emit('get_games');
  });
  
  socket.emit('get_games');
  
  socket.on('connect', () => {
    console.log('Socket reconnected, requesting games list');
    socket.emit('get_games');
  });
  
  return () => {
    socket.off('games_update', wrappedCallback);
    socket.off('game_update');
    socket.off('game_over');
    socket.off('connect');
  };
}

export function authenticateUser(socket: ReturnType<typeof Manager.prototype.socket> | null, userId: string) {
  if (!socket) return;
  socket.emit('authenticate', { userId });
}

export function createGame(socket: ReturnType<typeof Manager.prototype.socket> | null, user: { id: string; name?: string | null }, gameRules?: GameRules) {
  if (!socket) return;
  socket.emit('create_game', { user, gameRules });
}

interface JoinOptions {
  name?: string;
  team?: 1 | 2;
  browserSessionId?: string;
  position?: number;
  image?: string;
}

export function joinGame(socket: ReturnType<typeof Manager.prototype.socket> | null, gameId: string, userId: string, options?: JoinOptions) {
  if (!socket) return;
  console.log(`SOCKET JOIN: Game=${gameId}, Player=${userId}, Position=${options?.position}, Team=${options?.team}`);
  socket.emit('join_game', { 
    gameId, 
    userId, 
    testPlayer: options ? {
      name: options.name || userId,
      team: options.team || 1,
      browserSessionId: options.browserSessionId,
      position: options.position,
      image: options.image
    } : undefined,
    position: options?.position
  });
}

export function leaveGame(socket: ReturnType<typeof Manager.prototype.socket> | null, gameId: string, userId: string) {
  if (!socket) return;
  socket.emit('leave_game', { gameId, userId });
}

export function startGame(socket: ReturnType<typeof Manager.prototype.socket> | null, gameId: string, userId?: string) {
  if (!socket) return Promise.reject('No socket connection');
  
  return new Promise<void>((resolve, reject) => {
    const handleUpdate = (updatedGame: GameState) => {
      if (updatedGame.id === gameId && updatedGame.status === 'BIDDING') {
        socket.off('game_update', handleUpdate);
        resolve();
      }
    };
    
    const handleError = (error: any) => {
      console.error("Start game error:", error);
      socket.off('error', handleError);
      socket.off('game_update', handleUpdate);
      reject(error);
    };
    
    socket.on('game_update', handleUpdate);
    socket.on('error', handleError);
    
    socket.emit('start_game', { gameId, userId });
    
    setTimeout(() => {
      socket.off('game_update', handleUpdate);
      socket.off('error', handleError);
      reject('Timeout waiting for game to start');
    }, 5000);
  });
}

export function makeMove(socket: ReturnType<typeof Manager.prototype.socket> | null, gameId: string, userId: string, move: any) {
  if (!socket) return;
  socket.emit('make_move', { gameId, userId, move });
}

export function makeBid(socket: ReturnType<typeof Manager.prototype.socket> | null, gameId: string, userId: string, bid: number) {
  if (!socket) return;
  socket.emit('make_bid', { gameId, userId, bid });
}

export function playCard(socket: ReturnType<typeof Manager.prototype.socket> | null, gameId: string, userId: string, card: Card) {
  if (!socket) return;
  socket.emit('play_card', { gameId, userId, card });
}

export function sendChatMessage(socket: ReturnType<typeof Manager.prototype.socket> | null, gameId: string, message: any) {
  if (!socket) {
    console.error('Cannot send chat message: socket is null');
    return;
  }
  
  const sendWithRetry = (retryCount = 0) => {
    if (!socket.connected) {
      if (retryCount < 3) {
        console.log(`Socket not connected, retrying in ${Math.pow(2, retryCount)}s...`);
        setTimeout(() => sendWithRetry(retryCount + 1), Math.pow(2, retryCount) * 1000);
      } else {
        console.error('Failed to send message after 3 retries');
      }
      return;
    }

    try {
      console.log(`Sending chat message to game ${gameId}:`, message);
      socket.emit('chat_message', { 
        gameId, 
        message 
      }, (ack: any) => {
        if (ack?.error) {
          console.error('Error acknowledgment from server:', ack.error);
          if (retryCount < 3) {
            setTimeout(() => sendWithRetry(retryCount + 1), Math.pow(2, retryCount) * 1000);
          }
        }
      });
    } catch (error) {
      console.error('Error sending chat message:', error);
      if (retryCount < 3) {
        setTimeout(() => sendWithRetry(retryCount + 1), Math.pow(2, retryCount) * 1000);
      }
    }
  };

  sendWithRetry();
}

interface TrickWinnerData {
  winningCard?: {
    rank: number | string;
    suit: string;
  };
  winningPlayerId?: string;
  playerName?: string;
  gameId?: string;
}

export function debugTrickWinner(socket: ReturnType<typeof Manager.prototype.socket> | null, gameId: string, onTrickWinnerDetermined?: (data: TrickWinnerData) => void) {
  if (!socket) {
    console.error('Cannot setup debug: socket is null');
    return;
  }
  
  socket.on('trick_winner', (data: TrickWinnerData) => {
    console.log('🎯 DEBUG TRICK WINNER:', data);
    if (onTrickWinnerDetermined && data.gameId === gameId) {
      onTrickWinnerDetermined(data);
    }
  });
  
  return () => {
    socket.off('trick_winner');
  };
}

export function setupTrickCompletionDelay(
  socket: ReturnType<typeof Manager.prototype.socket> | null, 
  gameId: string, 
  onTrickComplete: (data: { trickCards: Card[], winningIndex: number }) => void
) {
  if (!socket) return () => {};
  
  let lastCompleteTrick: Card[] = [];
  let lastWinningData: TrickWinnerData | null = null;
  
  const handleTrickWinner = (data: TrickWinnerData) => {
    if (data.gameId !== gameId) return;
    lastWinningData = data;
  };
  
  socket.on('game_update', (data: GameState) => {
    if (data.id !== gameId) return;
    
    if (data.currentTrick && data.currentTrick.length === 4) {
      lastCompleteTrick = [...data.currentTrick];
      
      if (lastWinningData?.winningCard) {
        const winningIndex = lastCompleteTrick.findIndex(
          card => card.rank === lastWinningData?.winningCard?.rank && 
                 card.suit === lastWinningData?.winningCard?.suit
        );
        
        if (winningIndex >= 0) {
          onTrickComplete({
            trickCards: lastCompleteTrick,
            winningIndex
          });
        }
      }
    }
    else if (data.currentTrick && data.currentTrick.length === 0) {
      lastCompleteTrick = [];
      lastWinningData = null;
    }
  });
  
  socket.on('trick_winner', handleTrickWinner);
  
  return () => {
    socket.off('trick_winner', handleTrickWinner);
    socket.off('game_update');
  };
} 