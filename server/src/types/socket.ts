import type { Socket } from 'socket.io';

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  isAuthenticated?: boolean;
}

export interface SocketData {
  gameId?: string;
  userId?: string;
  message?: string;
  emoji?: string;
  [key: string]: any;
}
