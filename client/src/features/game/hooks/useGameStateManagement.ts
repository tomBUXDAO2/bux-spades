import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '@/features/auth/SocketContext';
import type { GameState } from "../../../types/game";

export const useGameStateManagement = (gameId: string, userId: string) => {
  const { socket, isReady } = useSocket();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasAttemptedJoin, setHasAttemptedJoin] = useState<boolean>(false);

  // Reset join attempt when gameId changes
  useEffect(() => {
    console.log('🎮 GameId changed, resetting hasAttemptedJoin');
    setHasAttemptedJoin(false);
    // Clear any stale gameId from localStorage
    const storedGameId = localStorage.getItem('activeGameId');
    if (storedGameId && storedGameId !== gameId) {
      console.log('🎮 Clearing stale gameId from localStorage:', storedGameId);
      localStorage.removeItem('activeGameId');
    }
  }, [gameId]);

  // Auto-join game when socket is ready and we haven't attempted join yet
  useEffect(() => {
    if (isReady && socket && gameId && userId && !hasAttemptedJoin) {
      console.log('🎮 Auto-joining game:', { gameId, userId, socketId: socket.id });
      setHasAttemptedJoin(true);
      socket.emit('join_game', { gameId, userId });
    }
  }, [isReady, socket, gameId, userId, hasAttemptedJoin]);

  // Debug: Log game state changes (display-only)
  useEffect(() => {
    if (gameState) {
      console.log('🎮 Game state updated (display-only):', {
        status: gameState.status,
        currentPlayer: gameState.currentPlayer,
        players: gameState.players?.length || 0,
        gameId: !!gameId,
        userId: !!userId,
        hands: (gameState as any).hands ? (gameState as any).hands.map((hand: any, i: number) => ({ seat: i, cards: hand?.length || 0 })) : 'no hands',
        playerHands: gameState.players?.map((p: any, i: number) => ({ seat: i, player: p?.username, handCards: p?.hand?.length || 0 })) || []
      });
    }
  }, [gameState, gameId, userId]);

  return {
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
  };
};
