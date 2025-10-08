import { useEffect } from 'react';
import { normalizeGameState } from './useGameStateNormalization';
import type { GameState } from "../../../types/game";

interface UseSocketEventHandlersProps {
  socket: any;
  isReady: boolean;
  gameId: string;
  userId: string;
  setGameState: (state: GameState | null) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHasAttemptedJoin: (attempted: boolean) => void;
}

export const useSocketEventHandlers = ({
  socket,
  isReady,
  gameId,
  userId,
  setGameState,
  setIsLoading,
  setError,
  setHasAttemptedJoin
}: UseSocketEventHandlersProps) => {
  useEffect(() => {
    if (!socket || !isReady) return;

    const handleGameJoined = (gameData: any) => {
      if (gameData && gameData.gameId === gameId) {
        setGameState(normalizeGameState(gameData.gameState));
        setIsLoading(false);
        setError(null);
        setHasAttemptedJoin(true);
        localStorage.setItem('activeGameId', gameId);
        
        // Clear timeout if it exists
        if ((window as any).gameJoinTimeout) {
          clearTimeout((window as any).gameJoinTimeout);
          (window as any).gameJoinTimeout = null;
        }
      }
    };

    const handleGameUpdate = (gameData: any) => {
      if (gameData && gameData.gameId === gameId) {
        setGameState(normalizeGameState(gameData.gameState));
      }
    };

    const handleGameError = (errorData: any) => {
      console.log('🎮 Game error event received:', errorData);
      if (errorData && errorData.gameId === gameId) {
        setError(errorData.message || 'Game error occurred');
        setIsLoading(false);
      }
    };

    const handleBiddingUpdate = (biddingData: any) => {
      console.log('🎮 Bidding update event received:', biddingData);
      if (biddingData && biddingData.gameId === gameId) {
        // Play bid sound for all bids (human and bot)
        if (biddingData.bid) {
          import('../../../services/utils/soundUtils').then(({ playBidSound }) => {
            playBidSound();
          });
        }
        
        // Use the full gameState from the server instead of just updating bidding
        if (biddingData.gameState) {
          setGameState(normalizeGameState(biddingData.gameState));
        } else {
          // Fallback to partial update if gameState not provided
          (setGameState as any)((prevState: any) => {
            if (!prevState) return prevState;
            return {
              ...prevState,
              bidding: biddingData.bidding
            };
          });
        }
      }
    };

    const handleCardPlayed = (cardData: any) => {
      console.log('🎮 Card played event received:', cardData);
      console.log('🎮 Card played - currentTrick data:', cardData.gameState?.play?.currentTrick);
      if (cardData && cardData.gameId === gameId) {
        // Play card sound effect for all card plays (human and bot)
        if (cardData.cardPlayed && !cardData.cardPlayed.rejected) {
          import('../../../services/utils/soundUtils').then(({ playCardSound }) => {
            playCardSound();
          });
        }
        
        (setGameState as any)((prevState: any) => {
          if (!prevState) return prevState;
          // Use the full gameState from the server if provided
          if (cardData.gameState) {
            console.log('🎮 Card played - setting game state with currentPlayer:', cardData.gameState.currentPlayer);
            console.log('🎮 Card played - currentTrick from event:', cardData.currentTrick);
            
            // CRITICAL: Preserve bidding data from previous state
            const gameStateWithBidding = {
              ...cardData.gameState,
              bidding: cardData.gameState.bidding || prevState.bidding
            };
            
            // CRITICAL: Ensure currentTrick data is properly integrated
            const normalizedState = normalizeGameState(gameStateWithBidding);
            if (cardData.currentTrick && Array.isArray(cardData.currentTrick)) {
              normalizedState.play = {
                ...normalizedState.play,
                currentTrick: cardData.currentTrick
              };
              // CRITICAL: Also set currentTrick at top level for renderTrickCards
              normalizedState.currentTrick = cardData.currentTrick;
            }
            return normalizedState;
          } else {
            // Fallback to partial update if gameState not provided
            return {
              ...prevState,
              play: {
                ...prevState.play,
                currentTrick: cardData.currentTrick || []
              }
            };
          }
        });
      }
    };

    const handleTrickComplete = (trickData: any) => {
      console.log('🎮 Trick complete event received:', trickData);
      if (trickData && trickData.gameId === gameId) {
        (setGameState as any)((prevState: any) => {
          if (!prevState) return prevState;
          // Use the full gameState from the server if provided
          if (trickData.gameState) {
            return normalizeGameState(trickData.gameState);
          } else {
            // Fallback to partial update if gameState not provided
            return {
              ...prevState,
              play: {
                ...prevState.play,
                currentTrick: [],
                tricks: trickData.tricks || []
              }
            };
          }
        });
      }
    };

    const handleTrickStarted = (trickData: any) => {
      console.log('🎮 Trick started event received:', trickData);
      if (trickData && trickData.gameId === gameId) {
        // Use the full gameState from the server if provided
        if (trickData.gameState) {
          console.log('🎮 Trick started - setting game state with currentPlayer:', trickData.gameState.currentPlayer);
          setGameState(normalizeGameState(trickData.gameState));
        } else {
          // Fallback to partial update if gameState not provided
          (setGameState as any)((prevState: any) => {
            if (!prevState) return prevState;
            return {
              ...prevState,
              play: {
                ...prevState.play,
                currentTrick: [],
                leadSuit: trickData.leadSuit
              }
            };
          });
        }
      }
    };

    const handleRoundStarted = (roundData: any) => {
      console.log('🎮 Round started event received:', roundData);
      if (roundData && roundData.gameId === gameId) {
        (setGameState as any)((prevState: any) => {
          if (!prevState) return prevState;
          
          // CRITICAL: Preserve bidding data from previous state
          const gameStateWithBidding = {
            ...roundData.gameState,
            bidding: roundData.gameState.bidding || prevState.bidding
          };
          
          return normalizeGameState(gameStateWithBidding);
        });
      }
    };


    const handleGameStarted = (gameData: any) => {
      console.log('🎮 Game started event received:', gameData);
      if (gameData && gameData.gameId === gameId) {
        setGameState(normalizeGameState(gameData.gameState));
        
        // Play card dealing sound effect when cards are dealt
        import('../../../services/utils/soundUtils').then(({ playCardDealingSound }) => {
          playCardDealingSound();
        });
      }
    };

    // Game completion is handled in GameEventHandlers.tsx

    const handleSocketError = (error: any) => {
      console.log('🎮 Socket error in useGameState:', error);
      setError(error.message || 'Socket connection error');
      setIsLoading(false);
    };

    const handleGameDeleted = (gameData: any) => {
      console.log('🎮 Game deleted event received:', gameData);
      if (gameData && gameData.gameId === gameId) {
        setError('Game was deleted - no human players remaining');
        setIsLoading(false);
        // Clear the game from localStorage
        localStorage.removeItem('activeGameId');
      }
    };

    // Add socket event listeners
    if (socket) {
      socket.on('game_joined', handleGameJoined);
      socket.on('game_update', handleGameUpdate);
      socket.on('bidding_update', handleBiddingUpdate);
      socket.on('card_played', handleCardPlayed);
      // Trick completion handled in GameEventHandlers.tsx
      socket.on('trick_started', handleTrickStarted);
      socket.on('round_started', handleRoundStarted);
      socket.on('game_started', handleGameStarted);
      // Game completion handled in GameEventHandlers.tsx
      socket.on('game_deleted', handleGameDeleted);
      // Error handling consolidated - handled in GameEventHandlers.tsx
    }
    
    // Cleanup
    return () => {
      if (socket) {
        socket.off('game_joined', handleGameJoined);
        socket.off('game_update', handleGameUpdate);
        socket.off('bidding_update', handleBiddingUpdate);
        socket.off('card_played', handleCardPlayed);
        // Trick completion handled in GameEventHandlers.tsx
        socket.off('trick_started', handleTrickStarted);
        socket.off('round_started', handleRoundStarted);
        socket.off('game_started', handleGameStarted);
        // Game completion handled in GameEventHandlers.tsx
        socket.off('game_deleted', handleGameDeleted);
        // Error handling consolidated - handled in GameEventHandlers.tsx
      }
    };
  }, [socket, isReady, gameId, userId, setGameState, setIsLoading, setError, setHasAttemptedJoin]);
};
