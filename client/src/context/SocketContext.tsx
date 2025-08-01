import React, { createContext, useContext, useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { getSocketManager } from '../table-ui/lib/socketManager';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  isReady: boolean;
  error: string | null;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  isAuthenticated: false,
  isReady: false,
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
    error: null as string | null
  });

  useEffect(() => {
    if (!user) {
      setSocket(null);
      setState({
        isConnected: false,
        isAuthenticated: false,
        isReady: false,
        error: null
      });
      return;
    }

    const socketManager = getSocketManager();
    socketManager.onStateChange((newState) => {
      setState(newState);
      setSocket(socketManager.getSocket());
    });

    socketManager.initialize(user.id, user.username, user.avatar || undefined);

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