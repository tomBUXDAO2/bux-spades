import React, { useEffect, useCallback, useMemo } from 'react';
import { normalizeGameState } from './useGameStateNormalization';
import type { GameState } from "../../../types/game";

interface UseOptimizedSocketEventHandlersProps {
  socket: any;
  isReady: boolean;
  gameId: string;
  userId: string;
  gameState: GameState | null;
  setGameState: (state: GameState | null) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHasAttemptedJoin: (attempted: boolean) => void;
}

export const useOptimizedSocketEventHandlers = ({
  socket,
  isReady,
  gameId,
  userId,
  gameState: currentGameState,
  setGameState,
  setIsLoading,
  setError,
  setHasAttemptedJoin
}: UseOptimizedSocketEventHandlersProps) => {
  // OPTIMIZED: Use useRef for lastGameUpdate to avoid re-renders
  const lastGameUpdateRef = React.useRef<{ timestamp: number; gameState: any } | null>(null);
  
  // OPTIMIZED: Memoize event handlers to prevent recreation on every render
  const handleGameJoined = useCallback((gameData: any) => {
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
  }, [gameId, setGameState, setIsLoading, setError, setHasAttemptedJoin]);

  const handleGameUpdate = useCallback((gameData: any) => {
    if (gameData && gameData.gameId === gameId) {
      const now = Date.now();
      const gameStateString = JSON.stringify(gameData.gameState);
      
      // OPTIMIZED: Enhanced duplicate detection with more granular comparison
      if (lastGameUpdateRef.current && 
          now - lastGameUpdateRef.current.timestamp < 100 && 
          JSON.stringify(lastGameUpdateRef.current.gameState) === gameStateString) {
        return;
      }
      
      // Update the last game update timestamp
      lastGameUpdateRef.current = { timestamp: now, gameState: gameData.gameState };
      
      // OPTIMIZED: Use requestAnimationFrame for smoother updates
      requestAnimationFrame(() => {
        const newState = normalizeGameState(gameData.gameState);
        setGameState(newState);
      });
    }
  }, [gameId, setGameState]);

  const handleGameError = useCallback((errorData: any) => {
    console.log('🎮 Game error event received:', errorData);
    if (errorData && errorData.gameId === gameId) {
      setError(errorData.message || 'Game error occurred');
      setIsLoading(false);
    }
  }, [gameId, setError, setIsLoading]);

  const handleBiddingUpdate = useCallback((biddingData: any) => {
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
        // CRITICAL FIX: Prevent bid corruption by preserving existing bids if new data has nulls
        const newState = normalizeGameState(biddingData.gameState);
        
        // Defensive: If we have existing state and new state has nulls, preserve the old bids
        if (currentGameState?.bidding?.bids && newState?.bidding?.bids) {
          const preservedBids = newState.bidding.bids.map((newBid: any, index: number) => {
            const oldBid = currentGameState.bidding.bids[index];
            // If old bid exists and new bid is null, keep the old bid
            if (oldBid !== null && oldBid !== undefined && (newBid === null || newBid === undefined)) {
              console.log(`[BIDDING UPDATE] Preserving bid for seat ${index}: ${oldBid} (server sent null)`);
              return oldBid;
            }
            return newBid;
          });
          newState.bidding.bids = preservedBids;
        }
        
        setGameState(newState);
      } else {
        // Fallback to partial update if gameState not provided
        setGameState((prevState: any) => {
          if (!prevState) return prevState;
          return {
            ...prevState,
            bidding: biddingData.bidding
          };
        });
      }
    }
  }, [gameId, currentGameState, setGameState]);

  const handleCardPlayed = useCallback((cardData: any) => {
    console.log('🎮 Card played event received:', cardData);
    console.log('🎮 Card played - currentTrick data:', cardData.gameState?.play?.currentTrick);
    if (cardData && cardData.gameId === gameId) {
      
      // Play card sound effect for all card plays (human and bot)
      if (cardData.cardPlayed && !cardData.cardPlayed.rejected) {
        import('../../../services/utils/soundUtils').then(({ playCardSound }) => {
          playCardSound();
        });
      }
      
      setGameState((prevState: any) => {
        if (!prevState) return prevState;
        // Use the full gameState from the server if provided
        if (cardData.gameState) {
          console.log('🎮 Card played - setting game state with currentPlayer:', cardData.gameState.currentPlayer);
          console.log('🎮 Card played - currentTrick from event:', cardData.currentTrick);
          
          // CRITICAL: Use the server's game state directly - it has the correct currentPlayer
          const serverGameState = cardData.gameState;
          
          // CRITICAL: Preserve bidding data and hands from previous state
          const gameStateWithBidding = {
            ...serverGameState,
            bidding: serverGameState.bidding || prevState.bidding,
            hands: serverGameState.hands || prevState.hands,
            // CRITICAL: Use server players data to ensure usernames/avatars are preserved
            players: serverGameState.players || prevState.players
          };
          
          // CRITICAL: Ensure currentTrick data is properly integrated
          const normalizedState = normalizeGameState(gameStateWithBidding);
          
          // Ensure currentTrick is never undefined - use data from currentTrick or gameState
          const currentTrick = cardData.currentTrick || serverGameState?.play?.currentTrick || [];
          if (Array.isArray(currentTrick)) {
            normalizedState.play = {
              ...normalizedState.play,
              currentTrick: currentTrick
            };
            // CRITICAL: Also set currentTrick at top level for renderTrickCards
            normalizedState.currentTrick = currentTrick;
          } else {
            // Fallback to empty array if currentTrick is not an array
            normalizedState.play = {
              ...normalizedState.play,
              currentTrick: []
            };
            normalizedState.currentTrick = [];
          }
          return normalizedState;
        } else {
          // Fallback to partial update if gameState not provided
          const currentTrick = cardData.currentTrick || prevState.play?.currentTrick || [];
          return {
            ...prevState,
            play: {
              ...prevState.play,
              currentTrick: Array.isArray(currentTrick) ? currentTrick : []
            },
            currentPlayer: cardData.currentPlayer || prevState.currentPlayer
          };
        }
      });
    }
  }, [gameId, setGameState]);

  const handleTrickComplete = useCallback((trickData: any) => {
    console.log('🎮 Trick complete event received:', trickData);
    if (trickData && trickData.gameId === gameId) {
      setGameState((prevState: any) => {
        if (!prevState) return prevState;
        // Use the full gameState from the server if provided
        if (trickData.gameState) {
          return normalizeGameState(trickData.gameState);
        } else {
          // CRITICAL: Don't clear currentTrick immediately - let the animation handle it
          // This prevents the 4th card from disappearing and re-rendering
          return {
            ...prevState,
            play: {
              ...prevState.play,
              // Keep currentTrick intact for animation
              tricks: trickData.tricks || []
            }
          };
        }
      });
    }
  }, [gameId, setGameState]);

  const handleTrickStarted = useCallback((trickData: any) => {
    console.log('🎮 Trick started event received:', trickData);
    if (trickData && trickData.gameId === gameId) {
      // Use the full gameState from the server if provided
      if (trickData.gameState) {
        console.log('🎮 Trick started - setting game state with currentPlayer:', trickData.gameState.currentPlayer);
        setGameState(normalizeGameState(trickData.gameState));
      } else {
        // Fallback to partial update if gameState not provided
        setGameState((prevState: any) => {
          if (!prevState) return prevState;
          
          // CRITICAL: Only update if we're actually starting a new trick
          // Don't interfere with current trick cards
          const isNewTrick = !prevState.play?.currentTrick || prevState.play.currentTrick.length === 0;
          
          if (isNewTrick) {
            return {
              ...prevState,
              play: {
                ...prevState.play,
                currentTrick: [],
                leadSuit: trickData.leadSuit
              }
            };
          } else {
            // Don't update if we're in the middle of a trick
            return prevState;
          }
        });
      }
    }
  }, [gameId, setGameState]);

  const handleRoundStarted = useCallback((roundData: any) => {
    console.log('🎮 Round started event received:', roundData);
    if (roundData && roundData.gameId === gameId) {
      setGameState((prevState: any) => {
        if (!prevState) return prevState;
        
        // CRITICAL: Preserve bidding data from previous state
        const gameStateWithBidding = {
          ...roundData.gameState,
          bidding: roundData.gameState.bidding || prevState.bidding
        };
        
        return normalizeGameState(gameStateWithBidding);
      });
    }
  }, [gameId, setGameState]);

  const handleGameStarted = useCallback((gameData: any) => {
    console.log('🎮 Game started event received:', gameData);
    if (gameData && gameData.gameId === gameId) {
      setGameState(normalizeGameState(gameData.gameState));
      
      // Play card dealing sound effect when cards are dealt
      import('../../../services/utils/soundUtils').then(({ playCardDealingSound }) => {
        playCardDealingSound();
      });
    }
  }, [gameId, setGameState]);

  const handleSocketError = useCallback((error: any) => {
    console.log('🎮 Socket error in useGameState:', error);
    setError(error.message || 'Socket connection error');
    setIsLoading(false);
  }, [setError, setIsLoading]);

  const handleGameDeleted = useCallback((gameData: any) => {
    console.log('🎮 Game deleted event received:', gameData);
    if (gameData && gameData.gameId === gameId) {
      setError('Game was deleted - no human players remaining');
      setIsLoading(false);
      // Clear the game from localStorage
      localStorage.removeItem('activeGameId');
    }
  }, [gameId, setError, setIsLoading]);

  // OPTIMIZED: Memoize event handlers object to prevent recreation
  const eventHandlers = useMemo(() => ({
    game_joined: handleGameJoined,
    game_update: handleGameUpdate,
    bidding_update: handleBiddingUpdate,
    card_played: handleCardPlayed,
    trick_started: handleTrickStarted,
    round_started: handleRoundStarted,
    game_started: handleGameStarted,
    game_deleted: handleGameDeleted,
    error: handleSocketError
  }), [
    handleGameJoined,
    handleGameUpdate,
    handleBiddingUpdate,
    handleCardPlayed,
    handleTrickStarted,
    handleRoundStarted,
    handleGameStarted,
    handleGameDeleted,
    handleSocketError
  ]);

  useEffect(() => {
    if (!socket || !isReady) return;

    // Add socket event listeners
    Object.entries(eventHandlers).forEach(([event, handler]) => {
      socket.on(event, handler);
    });
    
    // Cleanup
    return () => {
      Object.entries(eventHandlers).forEach(([event, handler]) => {
        socket.off(event, handler);
      });
    };
  }, [socket, isReady, eventHandlers]);
};
