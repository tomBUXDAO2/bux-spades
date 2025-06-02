import { createContext, useContext, useEffect, useRef, useState, useMemo, ReactNode } from 'react';
import { getSocketManager } from './socketManager';
// import { useSession } from 'next-auth/react';

// Define socket context interface
interface SocketContextType {
  isConnected: boolean;
  error: string | null;
}

// Create socket context
const SocketContext = createContext<SocketContextType>({
  isConnected: false,
  error: null
});

// Socket provider component
export const SocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // const { data: session, status } = useSession();
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketManager = useRef<ReturnType<typeof getSocketManager>>(getSocketManager());
  const isEffectActive = useRef(true);
  
  useEffect(() => {
    isEffectActive.current = true;
    const initializeSocket = async () => {
      try {
        // Call initialize with a dummy session object for now
        const dummySession = { user: { id: 'dummy', username: 'dummy', sessionToken: 'dummy' } };
        const socket = socketManager.current.initialize(dummySession);
        if (!socket || !isEffectActive.current) {
          console.log('Socket initialization failed or effect not active');
          return;
        }
        socket.on('connect', () => {
          if (!isEffectActive.current) return;
          console.log('Socket connected');
          setIsConnected(true);
          setError(null);
        });
        socket.on('disconnect', (reason: string) => {
          if (!isEffectActive.current) return;
          console.log('Socket disconnected:', reason);
          setIsConnected(false);
        });
        socket.on('session_replaced', () => {
          if (!isEffectActive.current) return;
          console.log('Session replaced');
          setIsConnected(false);
          setError('Session replaced by another connection');
        });
        socket.on('connect_error', (err: Error) => {
          if (!isEffectActive.current) return;
          console.error('Socket connection error:', err);
          setError(err.message);
        });
        setIsConnected(socket.connected);
        setError(null);
      } catch (err) {
        if (!isEffectActive.current) return;
        console.error('Socket connection error:', err);
        setError(err instanceof Error ? err.message : 'Failed to connect');
      }
    };
    initializeSocket();
    return () => {
      console.log('Cleaning up socket for component: default');
      isEffectActive.current = false;
    };
  }, []);
  
  const contextValue = useMemo(() => ({
    isConnected,
    error
  }), [isConnected, error]);
  
  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
};

// Custom hook to use socket context
export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}; 