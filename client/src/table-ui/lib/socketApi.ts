import { getSocket, initializeSocket } from './socketManager';
import type { GameRules } from '@/types/game';
import type { Socket } from 'socket.io-client';

// Create the socket API object
export const socketApi = {
  getSocket: (socketOverride?: Socket | null) => socketOverride || getSocket(),
  
  initializeSocket: async (userId: string, userName: string, socketOverride?: Socket | null) => {
    const socket = socketOverride || getSocket();
    return await initializeSocket({ userId, username: userName });
  },
  
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
    return new Promise<void>((resolve, reject) => {
      const socket = socketOverride || getSocket();
      if (!socket?.connected) {
        reject(new Error('Socket not connected'));
        return;
      }
      socket.emit('start_game', { gameId });
      resolve();
    });
  },
  
  sendChatMessage: (socketOverride: Socket | null, gameId: string, message: any) => {
    const socket = socketOverride || getSocket();
    if (!socket?.connected) {
      throw new Error('Socket not connected');
    }
    socket.emit('chat_message', { gameId, message });
  },
  
  setupTrickCompletionDelay: (socketOverride: Socket | null, gameId: string) => {
    const socket = socketOverride || getSocket();
    if (!socket?.connected) {
      throw new Error('Socket not connected');
    }
    socket.emit('setup_trick_completion_delay', { gameId });
  }
}; 