import React, { createContext, useContext, useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { getSocketManager } from '@/features/game/services/lib/socketManager';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  isReady: boolean;
  isGuestLobby: boolean;
  error: string | null;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  isAuthenticated: false,
  isReady: false,
  isGuestLobby: false,
  error: null
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [state, setState] = useState({
    isConnected: false,
    isAuthenticated: false,
    isReady: false,
    isGuestLobby: false,
    error: null as string | null
  });

  useEffect(() => {
    const socketManager = getSocketManager();

    const onChange = () => {
      const next = socketManager.getState();
      setState({
        isConnected: next.isConnected,
        isAuthenticated: next.isAuthenticated,
        isReady: next.isReady,
        isGuestLobby: next.isGuestLobby,
        error: next.error
      });
      setSocket(socketManager.getSocket());
    };

    socketManager.onStateChange(onChange);

    if (!user) {
      console.log('SOCKET CONTEXT - Guest lobby socket');
      socketManager.initializeGuest();
    } else {
      console.log('SOCKET CONTEXT - Initializing socket for user:', { id: user.id, username: user.username });
      socketManager.initialize(user.id, user.username, user.avatarUrl || undefined);
    }

    return () => {
      socketManager.disconnect();
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{
      socket,
      ...state
    }}>
      {children}
    </SocketContext.Provider>
  );
};
