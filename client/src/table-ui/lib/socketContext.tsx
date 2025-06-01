import { createContext, useContext, useEffect, useRef, useState, useMemo, ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { SocketManager } from './socketManager';

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
  const { data: session, status } = useSession();
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketManager = useRef<ReturnType<typeof SocketManager.getInstance>>(SocketManager.getInstance());
  const isEffectActive = useRef(true);
  const componentRegistered = useRef(false);
  
  useEffect(() => {
    isEffectActive.current = true;
    
    const initializeSocket = async () => {
      if (status !== 'authenticated' || !session?.user) {
        console.log('Waiting for session');
        return;
      }
      
      try {
        // Register component before initializing socket
        if (!componentRegistered.current) {
          await socketManager.current.registerComponent('default');
          componentRegistered.current = true;
        }
        
        const socket = await socketManager.current.initialize(
          session.user.id,
          session.user.name || session.user.email || ''
        );
        
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
      componentRegistered.current = false;
      
      socketManager.current.unregisterComponent('default');
    };
  }, [session, status]);
  
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