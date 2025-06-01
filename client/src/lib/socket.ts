import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const useSocket = () => {
  if (!socket) {
    socket = io(import.meta.env.VITE_API_URL || 'http://localhost:3001', {
      withCredentials: true,
    });
  }
  return { socket };
};

export const getSocket = () => socket; 