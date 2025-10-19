import { useCallback } from 'react';
import type { GameState, Card } from "../../../types/game";

interface UseGameActionsProps {
  socket: any;
  gameId: string;
  userId: string;
  gameState: GameState | null;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHasAttemptedJoin: (attempted: boolean) => void;
}

export const useGameActions = ({
  socket,
  gameId,
  userId,
  gameState,
  setIsLoading,
  setError,
  setHasAttemptedJoin
}: UseGameActionsProps) => {
  // Join game with improved timeout and retry logic
  const joinGame = useCallback(() => {
    if (!socket || !socket.connected) {
      setError('Not connected to server');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    const url = new URL(window.location.href);
    const spectate = url.searchParams.get('spectate') === '1';
    console.log('🎮 EMITTING join_game event:', { gameId, userId, spectate, socketId: socket.id, isConnected: socket.connected });
    socket.emit('join_game', { gameId, userId, spectate });
    
    // Reduced timeout to 5 seconds for better UX
    const timeout = setTimeout(() => {
      console.log('🎮 Timeout waiting for game_joined event, retrying...');
      setHasAttemptedJoin(false);
      setIsLoading(false);
      setError('Connection timeout - retrying...');
      
      // Auto-retry after 2 seconds
      setTimeout(() => {
        if (socket && socket.connected) {
          console.log('🎮 Auto-retrying game join...');
          setHasAttemptedJoin(false);
        }
      }, 2000);
    }, 5000); // 5 second timeout
    
    // Store timeout ID to clear it if game_joined is received
    (window as any).gameJoinTimeout = timeout;
  }, [socket, gameId, userId, setIsLoading, setError, setHasAttemptedJoin]);

  // Leave game
  const leaveGame = useCallback(() => {
    if (!socket) return;
    
    console.log('Leaving game:', gameId);
    socket.emit('leave_game', { gameId });
    setIsLoading(false);
  }, [socket, gameId, setIsLoading]);

  // Make a bid
  const makeBid = useCallback((bid: number, isNil: boolean = false, isBlindNil: boolean = false) => {
    if (!socket || !gameState) return;
    
    console.log('Making bid:', { gameId, bid, isNil, isBlindNil });
    socket.emit('make_bid', { 
      gameId, 
      bid, 
      isNil, 
      isBlindNil 
    });
  }, [socket, gameId, gameState]);

  // Play a card
  const playCard = useCallback((card: Card) => {
    if (!socket || !gameState) return;
    
    console.log('Playing card:', { gameId, card });
    socket.emit('play_card', { gameId, card });
  }, [socket, gameId, gameState]);


  // Invite bot to game
  const inviteBot = useCallback((seatIndex: number) => {
    if (!socket || !gameState) return;
    
    console.log('Inviting bot to seat:', seatIndex);
    socket.emit('invite_bot', { gameId, seatIndex });
  }, [socket, gameId, gameState]);

  return {
    joinGame,
    leaveGame,
    makeBid,
    playCard,
    inviteBot
  };
};
