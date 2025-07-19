import { getSocket } from './socketManager';
import type { GameRules } from '../../types/game';
import type { Socket } from 'socket.io-client';

// Helper function to wait for socket to be ready
const waitForSocketReady = (socket: Socket, timeout = 10000): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }

    const timeoutId = setTimeout(() => {
      reject(new Error('Socket connection timeout'));
    }, timeout);

    const onConnect = () => {
      clearTimeout(timeoutId);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
      resolve();
    };

    const onError = (error: any) => {
      clearTimeout(timeoutId);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
      reject(error);
    };

    socket.on('connect', onConnect);
    socket.on('connect_error', onError);
  });
};

// Create the socket API object
export const socketApi = {
  getSocket: (socketOverride?: Socket | null) => socketOverride || getSocket(),
  
  joinGame: async (socketOverride: Socket | null, gameId: string, userId: string, testPlayer?: { 
    name: string; 
    team: 1 | 2; 
    browserSessionId?: string; 
    position?: number; 
    image?: string;
  }) => {
    const socket = socketOverride || getSocket();
    if (!socket) {
      throw new Error('No socket available');
    }
    
    try {
      await waitForSocketReady(socket);
    } catch (error) {
      throw new Error('Socket connection failed: ' + error);
    }
    
    socket.emit('join_game', { gameId, userId, testPlayer });
  },
  
  createGame: async (socketOverride: Socket | null, user: { id: string; name?: string | null; image?: string | null }, rules: GameRules) => {
    const socket = socketOverride || getSocket();
    if (!socket) {
      throw new Error('No socket available');
    }
    
    try {
      await waitForSocketReady(socket);
    } catch (error) {
      throw new Error('Socket connection failed: ' + error);
    }
    
    socket.emit('create_game', { user, rules });
  },
  
  startGame: async (socketOverride: Socket | null, gameId: string): Promise<void> => {
    const socket = socketOverride || getSocket();
    if (!socket) {
      throw new Error('No socket available');
    }
    
    // Wait for socket to be ready
    try {
      await waitForSocketReady(socket);
    } catch (error) {
      throw new Error('Socket connection failed: ' + error);
    }
    
    return new Promise<void>((resolve, reject) => {
      const handleUpdate = (updatedGame: any) => {
        console.log('Received game_update in startGame:', updatedGame);
        if (updatedGame.id === gameId && updatedGame.status === 'BIDDING') {
          socket.off('game_update', handleUpdate);
          resolve();
        }
      };
      const handleError = (error: any) => {
        console.error('Start game error:', error);
        socket.off('error', handleError);
        socket.off('game_update', handleUpdate);
        reject(error);
      };
      socket.on('game_update', handleUpdate);
      socket.on('error', handleError);
      socket.emit('start_game', { gameId });
      setTimeout(() => {
        socket.off('game_update', handleUpdate);
        socket.off('error', handleError);
        reject('Timeout waiting for game to start');
      }, 5000);
    });
  },
  
  sendChatMessage: async (socketOverride: Socket | null, gameId: string, message: any) => {
    const socket = socketOverride || getSocket();
    if (!socket) {
      throw new Error('No socket available');
    }
    
    try {
      await waitForSocketReady(socket);
    } catch (error) {
      throw new Error('Socket connection failed: ' + error);
    }

    socket.emit('chat_message', { 
      gameId, 
      message: {
        ...message,
        gameId // Include gameId in the message object for consistency
      }
    });
  },
  
  setupTrickCompletionDelay: async (socketOverride: Socket | null, gameId: string) => {
    const socket = socketOverride || getSocket();
    if (!socket) {
      throw new Error('No socket available');
    }
    
    try {
      await waitForSocketReady(socket);
    } catch (error) {
      throw new Error('Socket connection failed: ' + error);
    }

    socket.emit('setup_trick_completion_delay', { gameId });
  }
}; 