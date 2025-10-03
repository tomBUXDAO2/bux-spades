import React, { useEffect } from 'react';
// import { useAuth } from '../../hooks/useAuth';
// import { v4 as uuidv4 } from 'uuid';
// import { socketApi } from '@/lib/socketApi';

const GameRoom: React.FC = () => {
  // const [gameState, setGameState] = useState<GameState | null>(null);
  // const { user } = useAuth();
  // const userId = user?.id;
  // const username = user?.username;
  // const componentId = React.useRef(uuidv4());

  useEffect(() => {
    // if (!userId || !username) {
    //   console.error('User not authenticated');
    //   return;
    // }

    const initializeSocket = async () => {
      // try {
      //   console.log('Initializing socket connection in GameRoom');
      //   const socket = await socketApi.initializeSocket(userId, username);
      //   
      //   if (!socket) {
      //     console.error('Failed to initialize socket');
      //     return;
      //   }

      // Set up connection state monitoring
      // socket.on('connect', () => {
      //   console.log('Socket connected in GameRoom');
      //   setIsConnected(true);
      //   // Re-join room if we were previously in one
      //   if (gameState?.roomId) {
      //     socket.emit('join_room', { roomId: gameState.roomId });
      //   }
      // });

      // socket.on('disconnect', (reason: string) => {
      //   console.log('Socket disconnected in GameRoom:', reason);
      //   setIsConnected(false);
      // });

      // Clean up socket listeners on unmount
      // return () => {
      //   socket.off('connect');
      //   socket.off('disconnect');
      // };
    };

    initializeSocket();
  }, []);

  return (
    <div>
      <h1>Game Room</h1>
      {/* {gameState && <p>Room ID: {gameState.roomId}</p>} */}
    </div>
  );
};

export default GameRoom; 