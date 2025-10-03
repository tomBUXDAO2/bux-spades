import { useCallback } from 'react';
import type { GameState, Card } from "../../types/game";

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
  // Join game
  const joinGame = useCallback(() => {
    if (!socket || !socket.connected) return;
    
    setIsLoading(true);
    setError(null);
    console.log('🎮 EMITTING join_game event:', { gameId, userId, socketId: socket.id, isConnected: socket.connected });
    socket.emit('join_game', { gameId, userId });
    
    // Set a timeout to handle cases where game_joined event is not received
    const timeout = setTimeout(() => {
      console.log('🎮 Timeout waiting for game_joined event, retrying...');
      setHasAttemptedJoin(false);
      setIsLoading(false);
      setError('Failed to join game - timeout');
    }, 10000); // 10 second timeout
    
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

  // Start game
  const startGame = useCallback(() => {
    if (!socket || !gameState) return;
    
    console.log('Starting game:', gameId);
    socket.emit('start_game', { gameId });
  }, [socket, gameId, gameState]);

  return {
    joinGame,
    leaveGame,
    makeBid,
    playCard,
    startGame
  };
};
