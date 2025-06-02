import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const useSocket = () => {
  if (!socket) {
    socket = io(import.meta.env.PROD ? import.meta.env.VITE_PROD_API_URL : import.meta.env.VITE_API_URL);
  }
  return { socket };
};

export const getSocket = () => socket; 