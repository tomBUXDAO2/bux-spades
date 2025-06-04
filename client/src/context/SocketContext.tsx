import React, { createContext, useContext, useEffect, useRef } from 'react';
import { getSocketManager } from '../table-ui/lib/socketManager';

const SocketContext = createContext<any>(null);

export const SocketProvider = ({ user, children }: { user: any, children: React.ReactNode }) => {
  const socketRef = useRef<any>(null);

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    const session = { user: { ...user, sessionToken: token } };
    socketRef.current = getSocketManager().initialize(session);
    return () => {
      socketRef.current?.disconnect();
    };
  }, [user]);

  return (
    <SocketContext.Provider value={socketRef.current}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext); 