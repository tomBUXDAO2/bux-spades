import { getSocket } from './socketManager';
import type { GameRules } from '../../types/game';
import type { Socket } from 'socket.io-client';

// Create the socket API object
export const socketApi = {
  getSocket: (socketOverride?: Socket | null) => socketOverride || getSocket(),
  
  joinGame: (socketOverride: Socket | null, gameId: string, userId: string, testPlayer?: { 
    name: string; 
    team: 1 | 2; 
    browserSessionId?: string; 
    position?: number; 
    image?: string;
  }) => {
    const socket = socketOverride || getSocket();
    if (!socket?.connected) {
      throw new Error('Socket not connected');
    }
    socket.emit('join_game', { gameId, userId, testPlayer });
  },
  
  createGame: (socketOverride: Socket | null, user: { id: string; name?: string | null; image?: string | null }, rules: GameRules) => {
    const socket = socketOverride || getSocket();
    if (!socket?.connected) {
      throw new Error('Socket not connected');
    }
    socket.emit('create_game', { user, rules });
  },
  
  startGame: (socketOverride: Socket | null, gameId: string): Promise<void> => {
    const socket = socketOverride || getSocket();
    if (!socket?.connected) {
      return Promise.reject(new Error('Socket not connected'));
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
  
  sendChatMessage: (socketOverride: Socket | null, gameId: string, message: any) => {
    const socket = socketOverride || getSocket();
    if (!socket?.connected) {
      throw new Error('Socket not connected');
    }
    socket.emit('chat_message', { 
      gameId, 
      message: {
        ...message,
        gameId // Include gameId in the message object for consistency
      }
    });
  },
  
  setupTrickCompletionDelay: (socketOverride: Socket | null, gameId: string) => {
    const socket = socketOverride || getSocket();
    if (!socket?.connected) {
      throw new Error('Socket not connected');
    }
    socket.emit('setup_trick_completion_delay', { gameId });
  }
}; 