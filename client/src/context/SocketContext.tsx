import React, { createContext, useContext, useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { getSocketManager } from '../table-ui/lib/socketManager';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  isAuthenticated: boolean;
  isReady: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  isAuthenticated: false,
  isReady: false
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const socketManager = getSocketManager();

    // Subscribe to socket state changes
    socketManager.onStateChange((state) => {
      console.log('Socket state changed:', state);
      setSocket(state.hasSocket ? socketManager.getSocket() : null);
      setIsConnected(state.isConnected);
      setIsAuthenticated(state.isAuthenticated);
      setIsReady(state.isReady);
    });

    // Initialize socket if we have a user
    const token = localStorage.getItem('sessionToken');
    const userData = localStorage.getItem('userData');
    
    if (token && userData) {
      try {
        const user = JSON.parse(userData);
        if (user.id && user.username) {
          console.log('Initializing socket with user:', { id: user.id, username: user.username });
          socketManager.initialize(user.id, user.username);
        } else {
          console.error('Invalid user data format:', user);
        }
      } catch (error) {
        console.error('Failed to parse user data:', error);
      }
    } else {
      console.log('No token or user data available for socket initialization');
    }

    return () => {
      console.log('Cleaning up socket connection');
      socketManager.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected, isAuthenticated, isReady }}>
      {children}
    </SocketContext.Provider>
  );
}; 