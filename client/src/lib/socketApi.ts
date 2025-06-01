import { Socket } from 'socket.io-client';
import { Card } from '../types/game';

export const socketApi = {
  sendChatMessage: (socket: Socket, gameId: string, message: any) => {
    socket.emit('chat_message', { gameId, ...message });
  },

  setupTrickCompletionDelay: (socket: Socket, gameId: string, callback: (data: { trickCards: Card[], winningIndex: number }) => void) => {
    const handler = (data: { trickCards: Card[], winningIndex: number }) => {
      callback(data);
    };
    socket.on('trick_complete', handler);
    return () => {
      socket.off('trick_complete', handler);
    };
  }
}; 