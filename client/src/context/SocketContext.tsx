import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSocketManager } from '../table-ui/lib/socketManager';

const SocketContext = createContext<any>(null);

export const SocketProvider = ({ user, children }: { user: any, children: React.ReactNode }) => {
  const [socket, setSocket] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    const session = { user: { ...user, sessionToken: token } };
    const newSocket = getSocketManager().initialize(session);
    setSocket(newSocket);
    return () => {
      newSocket?.disconnect();
    };
  }, [user]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext); 