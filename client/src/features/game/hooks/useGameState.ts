import { useGameStateManagement } from './useGameStateManagement';
import { useGameActions } from './useGameActions';
import { useSocketEventHandlers } from './useSocketEventHandlers';
import type { GameState, Card } from "../../../types/game";

export type GameType = 'REGULAR' | 'WHIZ' | 'SOLO' | 'MIRROR';

/**
 * Modular hook to manage game state with Socket.IO
 * @param gameId - ID of the game to connect to
 * @param userId - Current user's ID
 * @returns game state and methods to interact with the game
 */
export function useGameState(gameId: string, userId: string) {
  const {
    gameState,
    setGameState,
    error,
    setError,
    isLoading,
    setIsLoading,
    hasAttemptedJoin,
    setHasAttemptedJoin,
    socket,
    isReady
  } = useGameStateManagement(gameId, userId);

  const {
    joinGame,
    leaveGame,
    makeBid,
    playCard,
    startGame
  } = useGameActions({
    socket,
    gameId,
    userId,
    gameState,
    setIsLoading,
    setError,
    setHasAttemptedJoin
  });

  useSocketEventHandlers({
    socket,
    isReady,
    gameId,
    userId,
    setGameState,
    setIsLoading,
    setError,
    setHasAttemptedJoin
  });

  return {
    gameState,
    error,
    isLoading,
    joinGame,
    leaveGame,
    makeBid,
    playCard,
    startGame
  };
}

export default useGameState;
