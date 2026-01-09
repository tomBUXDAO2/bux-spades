import React, { useEffect } from 'react';
import { normalizeGameState } from './useGameStateNormalization';
import { playBidSound, playCardSound } from '../../../components/game/components/AudioManager';
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
  const previousBidsRef = React.useRef<Array<number | null | undefined> | null>(null);
  
  useEffect(() => {
    if (!socket || !isReady) return;

    const debugSocketListener = (eventName: string, payload: any) => {
      if (eventName === 'card_played' || eventName === 'bidding_update' || eventName === 'trick_complete') {
        console.log('[SOCKET DEBUG] Event received:', { eventName, payload });
      }
    };

    if (typeof socket?.onAny === 'function') {
      socket.onAny(debugSocketListener);
    }

    const handleGameJoined = (gameData: any) => {
      if (gameData && gameData.gameId === gameId) {
        const normalizedState = normalizeGameState(gameData.gameState);
        
        // CRITICAL FIX: Ensure currentTrick is properly preserved from server state
        // This is especially important for reconnections where players might have missed card_played events
        if (normalizedState.status === 'PLAYING') {
          const serverCurrentTrick = gameData.gameState?.play?.currentTrick || gameData.gameState?.currentTrickCards || [];
          if (Array.isArray(serverCurrentTrick) && serverCurrentTrick.length > 0) {
            normalizedState.play = {
              ...normalizedState.play,
              currentTrick: serverCurrentTrick
            };
            normalizedState.currentTrickCards = serverCurrentTrick;
            normalizedState.currentTrick = serverCurrentTrick;
            console.log('[GAME JOINED] Preserved currentTrick from server:', serverCurrentTrick.length, 'cards');
          }
        }
        
        setGameState(normalizedState);
        if (Array.isArray(normalizedState?.bidding?.bids)) {
          previousBidsRef.current = [...normalizedState.bidding.bids];
        } else {
          previousBidsRef.current = null;
        }
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
        
        // OPTIMIZED: Enhanced duplicate detection with more granular comparison
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
        
        // OPTIMIZED: Only log essential information to reduce console overhead
        console.log('🎮 Game update received:', {
          status: gameData.gameState?.status,
          currentRound: gameData.gameState?.currentRound,
          currentTrick: gameData.gameState?.currentTrick
        });
        
        // Update the last game update timestamp
        setLastGameUpdate({ timestamp: now, gameState: gameData.gameState });
        
        // OPTIMIZED: Use requestAnimationFrame for smoother updates
        requestAnimationFrame(() => {
          const newState = normalizeGameState(gameData.gameState);
          
          // CRITICAL FIX: Preserve currentTrick during gameplay if it exists
          // This prevents cards from disappearing during state updates
          if (newState.status === 'PLAYING') {
            const prevState = currentGameState;
            const serverCurrentTrick = gameData.gameState?.play?.currentTrick || gameData.gameState?.currentTrickCards || [];
            
            // If server has currentTrick data, use it
            if (Array.isArray(serverCurrentTrick) && serverCurrentTrick.length > 0) {
              newState.play = {
                ...newState.play,
                currentTrick: serverCurrentTrick
              };
              newState.currentTrickCards = serverCurrentTrick;
              newState.currentTrick = serverCurrentTrick;
            } 
            // Otherwise, preserve existing currentTrick from client state if available
            else if (prevState && Array.isArray(prevState.play?.currentTrick) && prevState.play.currentTrick.length > 0) {
              newState.play = {
                ...newState.play,
                currentTrick: prevState.play.currentTrick
              };
              newState.currentTrickCards = prevState.play.currentTrick;
              newState.currentTrick = prevState.play.currentTrick;
              console.log('[GAME UPDATE] Preserved existing currentTrick:', prevState.play.currentTrick.length, 'cards');
            }
          }
          
          setGameState(newState);
          if (Array.isArray(newState?.bidding?.bids)) {
            previousBidsRef.current = [...newState.bidding.bids];
          }
        });
      }
    };

    const handleGameError = (errorData: any) => {
      console.log('🎮 Game error event received:', errorData);
      if (errorData && errorData.gameId === gameId) {
        setError(errorData.message || 'Game error occurred');
        setIsLoading(false);
      }
    };

    const deriveBidChange = (data: any) => {
      if (data?.bid !== null && data?.bid !== undefined) {
        return {
          seatIndex: data.seatIndex ?? data.playerIndex ?? data.seat ?? null,
          value: data.bid,
          inferred: false
        };
      }

      const bidsFromPayload =
        (Array.isArray(data?.bids) && data.bids) ||
        (Array.isArray(data?.bidding?.bids) && data.bidding.bids) ||
        (Array.isArray(data?.gameState?.bidding?.bids) && data.gameState.bidding.bids);

      if (Array.isArray(bidsFromPayload)) {
        const previous = previousBidsRef.current || [];
        for (let i = 0; i < bidsFromPayload.length; i += 1) {
          const prevBid = previous[i];
          const nextBid = bidsFromPayload[i];
          if (
            nextBid !== null &&
            nextBid !== undefined &&
            (prevBid === null || prevBid === undefined || prevBid !== nextBid)
          ) {
            return {
              seatIndex: i,
              value: nextBid,
              inferred: true
            };
          }
        }
      }

      return null;
    };

    const handleBiddingUpdate = (biddingData: any) => {
      console.log('🎮 Bidding update event received:', biddingData);
      if (biddingData && biddingData.gameId === gameId) {
        const derivedBid = deriveBidChange(biddingData);

        // Play bid sound for all bids (human and bot)
        if (derivedBid) {
          console.log('[AUDIO DEBUG] bidding_update -> playBidSound()', derivedBid);
          playBidSound();
        }
        
        // Use the full gameState from the server instead of just updating bidding
        if (biddingData.gameState) {
          // CRITICAL FIX: Prevent bid corruption by preserving existing bids if new data has nulls
          const newState = normalizeGameState(biddingData.gameState);
          
          // CRITICAL FIX: Log the currentPlayer from server to debug the issue
          console.log('[BIDDING UPDATE] Server currentPlayer:', biddingData.gameState.currentPlayer);
          console.log('[BIDDING UPDATE] My userId:', userId);
          console.log('[BIDDING UPDATE] Is my turn?', biddingData.gameState.currentPlayer === userId);
          
        // Defensive: If we have existing state and new state has nulls, preserve the old bids
        // BUT ONLY if we're in the same round - don't preserve bids across rounds
        if (currentGameState?.bidding?.bids && newState?.bidding?.bids && 
            currentGameState.currentRound === newState.currentRound) {
          const preservedBids = newState.bidding.bids.map((newBid: any, index: number) => {
            const oldBid = currentGameState.bidding.bids[index];
            // If old bid exists and new bid is null, keep the old bid (same round only)
            if (oldBid !== null && oldBid !== undefined && (newBid === null || newBid === undefined)) {
              console.log(`[BIDDING UPDATE] Preserving bid for seat ${index}: ${oldBid} (server sent null, same round)`);
              return oldBid;
            }
            return newBid;
          });
          newState.bidding.bids = preservedBids;
        } else if (currentGameState?.currentRound !== newState?.currentRound) {
          console.log(`[BIDDING UPDATE] New round detected (${currentGameState?.currentRound} -> ${newState?.currentRound}), accepting server bids:`, newState.bidding.bids);
        }
          
          setGameState(newState);
          if (Array.isArray(newState?.bidding?.bids)) {
            previousBidsRef.current = [...newState.bidding.bids];
          }
        } else {
          // Fallback to partial update if gameState not provided
          (setGameState as any)((prevState: any) => {
            if (!prevState) return prevState;
            const updatedState = {
              ...prevState,
              bidding: biddingData.bidding
            };
            if (Array.isArray(biddingData?.bidding?.bids)) {
              previousBidsRef.current = [...biddingData.bidding.bids];
            }
            return updatedState;
          });
        }
      } else if (Array.isArray(biddingData?.bidding?.bids)) {
        previousBidsRef.current = [...biddingData.bidding.bids];
      }
    };

    const handleRoundStarted = (roundData: any) => {
      console.log('🎮 Round started event received:', roundData);
      if (roundData && roundData.gameId === gameId && roundData.gameState) {
        console.log('🎮 Round started - setting game state with currentPlayer:', roundData.gameState.currentPlayer);
        const newState = normalizeGameState(roundData.gameState);
        setGameState(newState);
        if (Array.isArray(newState?.bidding?.bids)) {
          previousBidsRef.current = [...newState.bidding.bids];
        } else {
          previousBidsRef.current = null;
        }
      }
    };

    const deriveCardPlayed = (data: any) => {
      if (data?.cardPlayed) return { ...data.cardPlayed, inferred: false };

      const currentTrickArray =
        (Array.isArray(data?.currentTrick) && data.currentTrick.length > 0 && data.currentTrick) ||
        (Array.isArray(data?.gameState?.play?.currentTrick) && data.gameState.play.currentTrick.length > 0 && data.gameState.play.currentTrick);

      if (currentTrickArray) {
        const lastCard = currentTrickArray[currentTrickArray.length - 1];
        if (lastCard) {
          return {
            userId: lastCard.playerId,
            seatIndex: lastCard.seatIndex,
            suit: lastCard.suit,
            rank: lastCard.rank,
            inferred: true
          };
        }
      }

      return null;
    };

    const handleCardPlayed = (cardData: any) => {
      console.log('🎮 Card played event received:', cardData);
      console.log('🎮 Card played - currentTrick data:', cardData.gameState?.play?.currentTrick);
      if (cardData && cardData.gameId === gameId) {
        
        console.log('[AUDIO DEBUG] card_played payload:', {
          hasCardPlayed: !!cardData.cardPlayed,
          cardPlayed: cardData.cardPlayed,
          completedTrick: cardData.completedTrick,
          currentTrick: cardData.currentTrick,
          keys: Object.keys(cardData || {})
        });

        const derivedCard = deriveCardPlayed(cardData);
        if (derivedCard && !derivedCard.rejected) {
          console.log('[AUDIO DEBUG] card_played -> playCardSound()', { inferred: derivedCard.inferred, seatIndex: derivedCard.seatIndex });
          playCardSound();
        }
        
        (setGameState as any)((prevState: any) => {
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
            const currentTrick = cardData.currentTrick || serverGameState?.play?.currentTrick || serverGameState?.currentTrickCards || [];
            if (Array.isArray(currentTrick) && currentTrick.length > 0) {
              normalizedState.play = {
                ...normalizedState.play,
                currentTrick: currentTrick
              };
              // CRITICAL: Also set currentTrick at top level for renderTrickCards
              normalizedState.currentTrick = currentTrick;
              normalizedState.currentTrickCards = currentTrick;
              console.log('[CARD PLAYED] Setting currentTrick with', currentTrick.length, 'cards');
            } else {
              // CRITICAL FIX: If server doesn't provide currentTrick, preserve existing one
              // This prevents cards from disappearing if the event doesn't include full trick data
              const existingTrick = prevState?.play?.currentTrick || [];
              if (Array.isArray(existingTrick) && existingTrick.length > 0) {
                normalizedState.play = {
                  ...normalizedState.play,
                  currentTrick: existingTrick
                };
                normalizedState.currentTrick = existingTrick;
                normalizedState.currentTrickCards = existingTrick;
                console.log('[CARD PLAYED] Preserved existing currentTrick:', existingTrick.length, 'cards');
              } else {
                // Fallback to empty array if no trick data available
              normalizedState.play = {
                ...normalizedState.play,
                currentTrick: []
              };
              normalizedState.currentTrick = [];
                normalizedState.currentTrickCards = [];
              }
            }
            if (Array.isArray(normalizedState?.bidding?.bids)) {
              previousBidsRef.current = [...normalizedState.bidding.bids];
            }
            return normalizedState;
          } else {
            // Fallback to partial update if gameState not provided
            const currentTrick = cardData.currentTrick || prevState.play?.currentTrick || [];
            const updatedState = {
              ...prevState,
              play: {
                ...prevState.play,
                currentTrick: Array.isArray(currentTrick) ? currentTrick : []
              },
              currentPlayer: cardData.currentPlayer || prevState.currentPlayer
            };
            if (Array.isArray(updatedState?.bidding?.bids)) {
              previousBidsRef.current = [...updatedState.bidding.bids];
            }
            return updatedState;
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
      
      // Don't treat "not in game" errors as fatal - just redirect to lobby
      if (error.message && error.message.includes('not in this game')) {
        console.log('🎮 User not in game, redirecting to lobby');
        setError('You are not in this game. Redirecting to lobby...');
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
        return;
      }
      
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
    socket.on('round_started', handleRoundStarted);
    socket.on('card_played', handleCardPlayed);
      // Trick completion handled in GameEventHandlers.tsx
      socket.on('trick_started', handleTrickStarted);
      socket.on('game_started', handleGameStarted);
      // Game completion handled in GameEventHandlers.tsx
      socket.on('game_deleted', handleGameDeleted);
      // Error handling consolidated - handled in GameEventHandlers.tsx
    }
    
    // Cleanup
    return () => {
      if (typeof socket?.offAny === 'function') {
        socket.offAny(debugSocketListener);
      }
      if (socket) {
        socket.off('game_joined', handleGameJoined);
        socket.off('game_update', handleGameUpdate);
      socket.off('bidding_update', handleBiddingUpdate);
      socket.off('round_started', handleRoundStarted);
      socket.off('card_played', handleCardPlayed);
        // Trick completion handled in GameEventHandlers.tsx
        socket.off('trick_started', handleTrickStarted);
        socket.off('game_started', handleGameStarted);
        // Game completion handled in GameEventHandlers.tsx
        socket.off('game_deleted', handleGameDeleted);
        // Error handling consolidated - handled in GameEventHandlers.tsx
      }
    };
  }, [socket, isReady, gameId, userId, setGameState, setIsLoading, setError, setHasAttemptedJoin]);

  useEffect(() => {
    if (Array.isArray(currentGameState?.bidding?.bids)) {
      previousBidsRef.current = [...currentGameState.bidding.bids];
    }
  }, [currentGameState?.bidding?.bids]);
};
