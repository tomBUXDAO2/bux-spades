import React, { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { v4 as uuidv4 } from 'uuid';
import { socketApi } from '@/lib/socketApi';

interface GameState {
  roomId: string;
  // Add other game state properties as needed
}

const GameRoom: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const { user } = useAuth();
  const userId = user?.id;
  const username = user?.username;
  const componentId = React.useRef(uuidv4());

  useEffect(() => {
    if (!userId || !username) {
      console.error('User not authenticated');
      return;
    }

    const initializeSocket = async () => {
      try {
        console.log('Initializing socket connection in GameRoom');
        const socket = await socketApi.initializeSocket(userId, username);
        
        if (!socket) {
          console.error('Failed to initialize socket');
          return;
        }

        // Set up connection state monitoring
        socket.on('connect', () => {
          console.log('Socket connected in GameRoom');
          setIsConnected(true);
          // Re-join room if we were previously in one
          if (gameState?.roomId) {
            socket.emit('join_room', { roomId: gameState.roomId });
          }
        });

        socket.on('disconnect', (reason: string) => {
          console.log('Socket disconnected in GameRoom:', reason);
          setIsConnected(false);
        });

        // Clean up socket listeners on unmount
        return () => {
          socket.off('connect');
          socket.off('disconnect');
        };
      } catch (error) {
        console.error('Error initializing socket:', error);
      }
    };

    initializeSocket();
  }, [userId, username, gameState?.roomId]);

  return (
    <div>
      <h1>Game Room</h1>
      <p>Connection status: {isConnected ? 'Connected' : 'Disconnected'}</p>
      {gameState && <p>Room ID: {gameState.roomId}</p>}
    </div>
  );
};

export default GameRoom; 