import React, { useEffect } from 'react';
import { normalizeGameState } from './useGameStateNormalization';
import type { GameState } from "../../../types/game";

interface UseSocketEventHandlersProps {
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

export const useSocketEventHandlers = ({
  socket,
  isReady,
  gameId,
  userId,
  gameState: currentGameState,
  setGameState,
  setIsLoading,
  setError,
  setHasAttemptedJoin
}: UseSocketEventHandlersProps) => {
  // Add state to track last game update to prevent duplicates
  const [lastGameUpdate, setLastGameUpdate] = React.useState<{ timestamp: number; gameState: any } | null>(null);
  
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
        const now = Date.now();
        const gameStateString = JSON.stringify(gameData.gameState);
        
        // Check if this is a duplicate update (same game state within 100ms)
        if (lastGameUpdate && 
            now - lastGameUpdate.timestamp < 100 && 
            JSON.stringify(lastGameUpdate.gameState) === gameStateString) {
          console.log('🎮 Duplicate game update ignored:', {
            status: gameData.gameState?.status,
            currentPlayer: gameData.gameState?.currentPlayer,
            currentRound: gameData.gameState?.currentRound
          });
          return;
        }
        
        console.log('🎮 Game update received - playerScores:', {
          playerScores: gameData.gameState?.playerScores,
          playerBags: gameData.gameState?.playerBags,
          gameMode: gameData.gameState?.gameMode,
          status: gameData.gameState?.status
        });
        
        // Update the last game update timestamp
        setLastGameUpdate({ timestamp: now, gameState: gameData.gameState });
        
        // CRITICAL: NEVER preserve hands from previous state - this causes hand flashing
        const newState = normalizeGameState(gameData.gameState);
        
        // NEVER preserve hands - let the server send the correct hands for each player
        // This prevents players from seeing other players' cards
        
        setGameState(newState);
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
            
            // Ensure currentTrick is never undefined - use data from currentTrick or gameState
            const currentTrick = cardData.currentTrick || cardData.gameState?.play?.currentTrick || [];
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
