import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from '@/features/auth/SocketContext';
import type { GameState } from "../../../types/game";

export const useGameStateManagement = (gameId: string, userId: string) => {
  const { socket, isReady } = useSocket();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasAttemptedJoin, setHasAttemptedJoin] = useState<boolean>(false);
  const lastLoggedStatus = useRef<string>('');

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
    if (!isReady || !socket || !gameId || !userId || hasAttemptedJoin) return;

    const spectate = (() => {
      try { return new URL(window.location.href).searchParams.get('spectate') === '1'; } catch { return false; }
    })();
    console.log('🎮 Auto-joining game:', { gameId, userId, spectate, socketId: socket.id });
    setHasAttemptedJoin(true);
    socket.emit('join_game', { gameId, userId, spectate });

    // Same pattern as joinGame(): timeout lives on window so this effect's
    // re-run (after setHasAttemptedJoin) does not clear it via cleanup.
    if ((window as any).gameJoinTimeout) {
      clearTimeout((window as any).gameJoinTimeout);
    }
    (window as any).gameJoinTimeout = setTimeout(() => {
      console.log('🎮 Auto-join timeout waiting for game_joined, allowing retry');
      setHasAttemptedJoin(false);
      setIsLoading(false);
      setError('Connection timeout - retrying...');
    }, 5000);
  }, [isReady, socket, gameId, userId, hasAttemptedJoin]);

  // Clear join timeout on unmount / game change
  useEffect(() => {
    return () => {
      if ((window as any).gameJoinTimeout) {
        clearTimeout((window as any).gameJoinTimeout);
        (window as any).gameJoinTimeout = null;
      }
    };
  }, [gameId]);

  // Debug: Log game state changes (display-only) - only log major state changes
  useEffect(() => {
    if (gameState && gameState.status) {
      // Only log status changes, not every render
      const statusKey = `${gameState.status}-${gameState.currentPlayer}`;
      if (statusKey !== lastLoggedStatus.current) {
        lastLoggedStatus.current = statusKey;
        console.log('🎮 Game state updated:', {
          status: gameState.status,
          currentPlayer: gameState.currentPlayer,
          players: gameState.players?.length || 0
        });
      }
    }
  }, [gameState?.status, gameState?.currentPlayer, gameState?.players?.length]);

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
