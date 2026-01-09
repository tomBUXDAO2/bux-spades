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

// Game event handlers and socket management for GameTable
// Handles all socket events and game state updates

import { useEffect, useRef, useCallback } from 'react';
import type { GameState, Card, Player, Bot } from "../../../types/game";
import type { ChatMessage } from "../../../features/chat/Chat";
import { normalizeGameState } from "../../../features/game/hooks/useGameStateNormalization";
import { playCardSound } from "./AudioManager";

interface GameEventHandlersProps {
  socket: any;
  gameState: GameState;
  user: any;
  
  // State setters
  setGameState: (state: GameState | ((prev: GameState) => GameState)) => void;
  setDealingComplete: (complete: boolean) => void;
  setBiddingReady: (ready: boolean) => void;
  setCardsRevealed: (revealed: boolean) => void;
  setShowHandSummary: (show: boolean) => void;
  setHandSummaryData: (data: any) => void;
  setShowWinner: (show: boolean) => void;
  setShowLoser: (show: boolean) => void;
  setFinalScores: (scores: { team1Score: number; team2Score: number } | null) => void;
  setFinalPlayerScores: (scores: number[] | null) => void;
  setCountdownPlayer: (player: { playerId: string; playerIndex: number; timeLeft: number } | null) => void;
  setEmojiReactions: (reactions: Record<string, { emoji: string; timestamp: number }>) => void;
  setEmojiTravels: (travels: Array<{
    id: string;
    emoji: string;
    fromPosition: { x: number; y: number };
    toPosition: { x: number; y: number };
  }>) => void;
  setAnimatingTrick: (animating: boolean) => void;
  setAnimatedTrickCards: (cards: Card[]) => void;
  setTrickWinner: (winner: number | null) => void;
  setTrickCompleted: (completed: boolean) => void;
  setLastNonEmptyTrick: (trick: Card[]) => void;
  setPendingPlayedCard: (card: Card | null) => void;
  setPendingBid: (bid: { playerId: string; bid: number } | null) => void;
  setLeagueReady: (ready: boolean[]) => void;
  setSeatReplacement: (replacement: {
    isOpen: boolean;
    seatIndex: number;
    expiresAt: number;
  }) => void;
  setLobbyMessages: (messages: ChatMessage[]) => void;
  setRecentChatMessages: (messages: Record<string, ChatMessage>) => void;
  
  // Handlers
  onNewHandStarted: () => void;
  onGameJoined: (data: any) => void;
  onGameStarted: (data: any) => void;
  onHandCompleted: (data: any) => void;
  onGameOver: (data: any) => void;
  onTrickComplete: (data: any) => void;
  onClearTableCards: (data?: any) => void;
  onSocketError: (error: { message: string }) => void;
  onEmojiReaction: (data: { playerId: string; emoji: string }) => void;
  onSendEmoji: (data: { fromPlayerId: string; toPlayerId: string; emoji: string }) => void;
  onLobbyMessage: (msg: ChatMessage) => void;
  onGameMessage: (data: any) => void;
  onLeagueReadyUpdate: (payload: { gameId: string; readyStates: Record<string, boolean> }) => void;
  onLeagueStartDenied: (p: any) => void;
  onSeatReplacementStarted: (data: { gameId: string; seatIndex: number; expiresAt: number }) => void;
  onGameClosed: (data: { reason: string }) => void;
  
  // Utility functions
  isPlayer: (p: Player | Bot | null) => p is Player;
  isBot: (p: Player | Bot | null) => p is Bot;
}

// Hook for managing game event handlers
export const useGameEventHandlers = (props: GameEventHandlersProps) => {
  const {
    socket,
    gameState,
    user,
    setGameState,
    setDealingComplete,
    setBiddingReady,
    setCardsRevealed,
    setShowHandSummary,
    setHandSummaryData,
    setShowWinner,
    setShowLoser,
    setFinalScores,
    setFinalPlayerScores,
    setCountdownPlayer,
    setEmojiReactions,
    setEmojiTravels,
    setAnimatingTrick,
    setAnimatedTrickCards,
    setTrickWinner,
    setTrickCompleted,
    setLastNonEmptyTrick,
    setPendingPlayedCard,
    setPendingBid,
    setLeagueReady,
    setSeatReplacement,
    setLobbyMessages,
    setRecentChatMessages,
    onNewHandStarted,
    onGameJoined,
    onGameStarted,
    onHandCompleted,
    onGameOver,
    onTrickComplete,
    onClearTableCards,
    onSocketError,
    onEmojiReaction,
    onSendEmoji,
    onLobbyMessage,
    onGameMessage,
    onLeagueReadyUpdate,
    onLeagueStartDenied,
    onSeatReplacementStarted,
    onGameClosed,
    isPlayer,
    isBot
  } = props;

  const trickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize audio when component mounts
  useEffect(() => {
    // Audio initialization is now handled by AudioManager
  }, []);

  // Listen for countdown start events
  useEffect(() => {
    if (!socket) return;
    
    const handleCountdownStart = (data: { playerId: string; playerIndex: number; timeLeft: number }) => {
      setCountdownPlayer(data);
      
      // Start countdown timer
      const countdownInterval = setInterval(() => {
        (setCountdownPlayer as any)((prev: any) => {
          if (!prev) return null;
          if (prev.timeLeft <= 1) {
            clearInterval(countdownInterval);
            return null; // Countdown finished
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
      }, 1000);
    };
    
    // Clear countdown when any player acts (bidding or playing)
    const handlePlayerActed = () => {
      setCountdownPlayer(null);
    };
    
    // Clear pending bid when bidding is complete
    const handleBiddingComplete = () => {
      setPendingBid(null);
      console.log('[OPTIMISTIC BID] Cleared pending bid - bidding complete');
    };
    
    socket.on('countdown_start', handleCountdownStart);
    socket.on('bidding_ready', handlePlayerActed);
    socket.on('bidding_complete', handleBiddingComplete);
    socket.on('play_start', handlePlayerActed);
    socket.on('trick_completed', handlePlayerActed);
    
    return () => {
      socket.off('countdown_start', handleCountdownStart);
      socket.off('bidding_ready', handlePlayerActed);
      socket.off('bidding_complete', handleBiddingComplete);
      socket.off('play_start', handlePlayerActed);
      socket.off('trick_completed', handlePlayerActed);
    };
  }, [socket, setCountdownPlayer]);

  // Listen for new hand started events
  useEffect(() => {
    if (!socket) return;
    
    const handleNewHandStartedEvent = (data: any) => {
      console.log('🎮 New hand started event received:', data);
      // CRITICAL: Reset cardsRevealed BEFORE updating game state to prevent card flash
      setCardsRevealed(false);
      setDealingComplete(false);
      setBiddingReady(false);
      
      if (data && data.gameState) {
        // Update game state with new hands
        setGameState(normalizeGameState(data.gameState));
      }
      onNewHandStarted();
    };
    
    socket.on('new_hand_started', handleNewHandStartedEvent);
    
    return () => {
      socket.off('new_hand_started', handleNewHandStartedEvent);
    };
  }, [socket, onNewHandStarted, setGameState]);

  // game_joined handled in useSocketEventHandlers.ts

  // Handle game started event
  useEffect(() => {
    if (!socket) return;
    
    socket.on('game_started', onGameStarted);
    
    return () => {
      socket.off('game_started', onGameStarted);
    };
  }, [socket, onGameStarted]);

  // Effect to handle round completion (replaces hand_completed)
  useEffect(() => {
    if (!socket) return;

    const roundCompletedHandler = (data: any) => {
      console.log('🎮 Round complete event received:', data);
      console.log('🎮 Round complete - setting game state with currentPlayer:', data.gameState?.currentPlayer);
      console.log('🎮 Round complete - scores data:', data.scores);
      console.log('🎮 Round complete - data keys:', Object.keys(data || {}));
      
      // Stop any active turn countdown on round completion
      setCountdownPlayer(null);
      // Clear any pending played card to avoid ghost overlays
      setPendingPlayedCard(null);

      // Update game state with new scores for scoreboard
      if (data.gameState) {
        setGameState((prevState: GameState) => ({
          ...prevState,
          ...data.gameState,
          // Use running totals from server (already calculated correctly)
          team1TotalScore: data.scores?.team1TotalScore || data.gameState.team1TotalScore || 0,
          team2TotalScore: data.scores?.team2TotalScore || data.gameState.team2TotalScore || 0,
          team1Bags: data.scores?.team1Bags || 0,
          team2Bags: data.scores?.team2Bags || 0,
          // Update player scores for solo games
          playerScores: data.scores?.playerScores || data.gameState.playerScores || prevState.playerScores,
          playerBags: data.scores?.playerBags || data.gameState.playerBags || prevState.playerBags
        }));
      }
      
      // CRITICAL FIX: Delay hand summary until after trick animation completes
      // This prevents the hand summary from showing before the final trick animation finishes
      console.log('🎮 Delaying hand summary to allow trick animation to complete');
      setTimeout(() => {
        console.log('🎮 Showing hand summary after delay');
        onHandCompleted(data);
      }, 1200); // Shorter delay to keep game pace snappy
    };
    
    socket.on('round_complete', roundCompletedHandler);
    
    return () => {
      socket.off('round_complete', roundCompletedHandler);
    };
  }, [socket, onHandCompleted]);

  // Effect to handle game completion
  useEffect(() => {
    if (!socket) return;

    socket.on('game_over', onGameOver);

    return () => {
      socket.off('game_over', onGameOver);
    };
  }, [socket, onGameOver]);

  // Effect to handle trick_started so currentPlayer is up to date when a new trick begins
  useEffect(() => {
    if (!socket) return;

    const trickStartedHandler = (data: any) => {
      try {
        // Prefer full gameState if provided
        if (data && data.gameState) {
          setGameState(normalizeGameState(data.gameState));
        } else if (data && (data.currentPlayer || data.leadSuit !== undefined)) {
          // Minimal update: set currentPlayer and reset currentTrick if we have partial payload
          setGameState((prev: GameState) => ({
            ...prev,
            currentPlayer: data.currentPlayer || (prev as any).currentPlayer,
            play: {
              ...(prev as any).play,
              currentTrick: []
            }
          } as any));
        }
        // Clear any pending played card at trick start
        setPendingPlayedCard(null);
      } catch {}
    };

    socket.on('trick_started', trickStartedHandler);
    return () => {
      socket.off('trick_started', trickStartedHandler);
    };
  }, [socket, setGameState, setPendingPlayedCard]);

  // Effect to handle game_complete event (new event from server)
  useEffect(() => {
    if (!socket) return;

    const gameCompleteHandler = (data: any) => {
      console.log('🎮 Game complete event received:', data);
      console.log('🎮 Game complete - scores:', data.scores);
      console.log('🎮 Game complete - winner:', data.winner);
      
      // Clear active game ID from localStorage
      localStorage.removeItem('activeGameId');
      
      // Update game state
      if (data.gameState) {
        setGameState((prevState: GameState) => {
          const newState: any = {
            ...prevState,
            ...data.gameState
          };
          
          const appliedScores = data.scores ?? {
            team1Score: data.gameState.team1TotalScore,
            team2Score: data.gameState.team2TotalScore,
            playerScores: data.gameState.playerScores,
            team1Bags: data.gameState.team1Bags,
            team2Bags: data.gameState.team2Bags
          };

          if (appliedScores) {
            if (typeof appliedScores.team1Score === 'number') newState.team1TotalScore = appliedScores.team1Score;
            if (typeof appliedScores.team2Score === 'number') newState.team2TotalScore = appliedScores.team2Score;
            if (Array.isArray(appliedScores.playerScores)) newState.playerScores = appliedScores.playerScores;
            if (typeof appliedScores.team1Bags === 'number') newState.team1Bags = appliedScores.team1Bags;
            if (typeof appliedScores.team2Bags === 'number') newState.team2Bags = appliedScores.team2Bags;
          }
          
          // For solo games, set winningPlayer from the winner
          const winnerToken = data.winner ?? data.gameState?.winner;
          if (typeof winnerToken === 'string' && winnerToken.startsWith('PLAYER_')) {
            const playerIndex = parseInt(winnerToken.split('_')[1], 10);
            if (!Number.isNaN(playerIndex)) {
              newState.winningPlayer = playerIndex; // Keep 0-based for solo games
            }
          }
          
          return newState;
        });
      }
      
      // Show winners modal / final summary even if scores missing
      const appliedScores = data.scores ?? (data.gameState ? {
        team1Score: data.gameState.team1TotalScore ?? 0,
        team2Score: data.gameState.team2TotalScore ?? 0,
        playerScores: data.gameState.playerScores ?? [],
        team1Bags: data.gameState.team1Bags ?? 0,
        team2Bags: data.gameState.team2Bags ?? 0
      } : null);

      const winnerToken = data.winner ?? data.gameState?.winner ?? null;
      let winningTeam = 1;

      if (typeof winnerToken === 'string') {
        if (winnerToken.startsWith('TEAM_')) {
          const parsed = parseInt(winnerToken.split('_')[1], 10);
          if (!Number.isNaN(parsed)) winningTeam = parsed + 1;
        } else if (winnerToken.startsWith('PLAYER_')) {
          const parsed = parseInt(winnerToken.split('_')[1], 10);
          if (!Number.isNaN(parsed)) winningTeam = parsed;
        }
      } else if (typeof winnerToken === 'number') {
        winningTeam = winnerToken;
      } else if (appliedScores && typeof appliedScores.team1Score === 'number' && typeof appliedScores.team2Score === 'number') {
        winningTeam = appliedScores.team1Score >= appliedScores.team2Score ? 1 : 2;
      }

      if (appliedScores) {
        // Persist final scores immediately so winner modal reflects the true final totals
        if (typeof appliedScores.team1Score === 'number' || typeof appliedScores.team2Score === 'number') {
          setFinalScores({
            team1Score: typeof appliedScores.team1Score === 'number' ? appliedScores.team1Score : (gameState.team1TotalScore ?? 0),
            team2Score: typeof appliedScores.team2Score === 'number' ? appliedScores.team2Score : (gameState.team2TotalScore ?? 0)
          });
        }
        if (Array.isArray(appliedScores.playerScores)) {
          setFinalPlayerScores(appliedScores.playerScores);
        }

        const winnerData = {
          team1Score: appliedScores.team1Score ?? 0,
          team2Score: appliedScores.team2Score ?? 0,
          winningTeam,
          playerScores: appliedScores.playerScores ?? []
        };
        console.log('🎮 Game complete - calling onGameOver with:', winnerData);
        onGameOver(winnerData);
      }
    };

    socket.on('game_complete', gameCompleteHandler);

    return () => {
      socket.off('game_complete', gameCompleteHandler);
    };
  }, [socket, onGameOver]);

  // Listen for card_played event to clear pending cards immediately
  useEffect(() => {
    if (socket) {
      const cardPlayedHandler = (cardData: any) => {
        console.log('🎮 Card played event received in GameEventHandlers:', cardData);
        
        // Play card sound for every successful card play (human or bot)
        console.log('[AUDIO DEBUG] GameEventHandlers card_played payload:', {
          hasCardPlayed: !!cardData?.cardPlayed,
          cardPlayed: cardData?.cardPlayed,
          keys: Object.keys(cardData || {})
        });
        const derivedCard = deriveCardPlayed(cardData);
        if (derivedCard && !derivedCard.rejected) {
          console.log('[AUDIO DEBUG] GameEventHandlers card_played -> playCardSound()', { inferred: derivedCard.inferred, seatIndex: derivedCard.seatIndex });
          playCardSound();
        }

        // CRITICAL: Clear pending played card immediately when server confirms the play
        // This prevents cards from staying in hand if played quickly before trick completion
        if (cardData.cardPlayed && cardData.cardPlayed.userId === user?.id) {
          setPendingPlayedCard(null);
          console.log('🎮 Cleared pending played card - server confirmed play for user:', user?.id);
        }
      };
      
      socket.on("card_played", cardPlayedHandler);
      
      return () => {
        socket.off("card_played", cardPlayedHandler);
      };
    }
  }, [socket, user?.id, setPendingPlayedCard]);

  // Listen for trick_complete event and animate trick
  useEffect(() => {
    if (socket) {
      const trickCompleteHandler = (data: any) => {
        console.log('🎮 Trick complete event received:', data);
        console.log('🎮 Trick complete - setting game state with currentPlayer:', data.gameState?.currentPlayer);
        
        // Clear pending played card when trick completes
        setPendingPlayedCard(null);
        
        // Update game state if provided
        if (data.gameState) {
          setGameState((prevState: GameState) => ({
            ...prevState,
            ...data.gameState
          }));
        }
        
        // Call the animation handler
        onTrickComplete(data);
      };
      
      socket.on("trick_complete", trickCompleteHandler);
      socket.on("clear_table_cards", onClearTableCards);
      
      return () => {
        socket.off("trick_complete", trickCompleteHandler);
        if (trickTimeoutRef.current) clearTimeout(trickTimeoutRef.current);
        socket.off("clear_table_cards", onClearTableCards);
      };
    }
  }, [socket, onTrickComplete, onClearTableCards]);

  // Listen for game_closed events
  useEffect(() => {
    if (!socket) return;
    
    socket.on('game_closed', onGameClosed);
    
    return () => {
      socket.off('game_closed', onGameClosed);
    };
  }, [socket, onGameClosed]);

  // Listen for socket errors
  useEffect(() => {
    if (!socket) return;
    
    socket.on('error', onSocketError);
    
    return () => {
      socket.off('error', onSocketError);
    };
  }, [socket, onSocketError]);

  // Emoji reaction handlers
  useEffect(() => {
    if (!socket) return;
    
    socket.on('emoji_reaction', onEmojiReaction);
    socket.on('send_emoji', onSendEmoji);
    
    return () => {
      socket.off('emoji_reaction', onEmojiReaction);
      socket.off('send_emoji', onSendEmoji);
    };
  }, [socket, onEmojiReaction, onSendEmoji]);

  // Lobby chat handler
  useEffect(() => {
    if (!socket) return;
    
    socket.on('lobby_chat_message', onLobbyMessage);
    
    return () => {
      socket.off('lobby_chat_message', onLobbyMessage);
    };
  }, [socket, onLobbyMessage]);

  // Game chat handler - CRITICAL: Listen to CustomEvent to avoid duplicates
  useEffect(() => {
    const handleGameMessageEvent = (event: Event) => {
      const customEvent = event as CustomEvent;
      onGameMessage(customEvent.detail);
    };
    
    window.addEventListener('gameMessage', handleGameMessageEvent);
    
    return () => {
      window.removeEventListener('gameMessage', handleGameMessageEvent);
    };
  }, [onGameMessage]);

  // League handlers
  useEffect(() => {
    if (!socket) return;
    
    socket.on('league_ready_update', onLeagueReadyUpdate);
    socket.on('league_start_denied', onLeagueStartDenied);
    
    return () => {
      socket.off('league_ready_update', onLeagueReadyUpdate);
      socket.off('league_start_denied', onLeagueStartDenied);
    };
  }, [socket, onLeagueReadyUpdate, onLeagueStartDenied]);

  // Seat replacement handler
  useEffect(() => {
    if (!socket) return;
    
    socket.on('seat_replacement_started', onSeatReplacementStarted);
    
    return () => {
      socket.off('seat_replacement_started', onSeatReplacementStarted);
    };
  }, [socket, onSeatReplacementStarted]);

  // Play again handlers
  useEffect(() => {
    if (!socket) return;

    const newGameCreatedHandler = (data: any) => {
      console.log('[PLAY AGAIN] New game created:', data);
      if (data.newGameId) {
        // Update localStorage with new game ID
        localStorage.setItem('activeGameId', data.newGameId);
        // Redirect to new game table
        window.location.href = `/table/${data.newGameId}`;
      }
    };

    socket.on('new_game_created', newGameCreatedHandler);
    
    return () => {
      socket.off('new_game_created', newGameCreatedHandler);
    };
  }, [socket]);

  return {
    trickTimeoutRef
  };
};
