// Game event handlers and socket management for GameTable
// Handles all socket events and game state updates

import { useEffect, useRef, useCallback } from 'react';
import type { GameState, Card, Player, Bot } from "../../../types/game";
import type { ChatMessage } from "../../../features/chat/Chat";
import { normalizeGameState } from "../../../features/game/hooks/useGameStateNormalization";

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
  onClearTableCards: () => void;
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
      
      // Call the existing hand completed handler
      onHandCompleted(data);
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
          const newState = {
            ...prevState,
            ...data.gameState
          };
          
          // For solo games, set winningPlayer from the winner
          if (data.winner && data.winner.startsWith('PLAYER_')) {
            const playerIndex = parseInt(data.winner.split('_')[1]);
            newState.winningPlayer = playerIndex;
          }
          
          return newState;
        });
      }
      
      // Show winners modal
      if (data.winner && data.scores) {
        const winnerData = {
          team1Score: data.scores.team1Score || 0,
          team2Score: data.scores.team2Score || 0,
          winningTeam: data.winner === 'TEAM_0' ? 1 : 2,
          playerScores: data.scores.playerScores || []
        };
        
        // For solo games, update winningTeam to be the player index
        if (data.winner && data.winner.startsWith('PLAYER_')) {
          const playerIndex = parseInt(data.winner.split('_')[1]);
          winnerData.winningTeam = playerIndex; // Keep 0-based for solo games
        }
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

  // Game chat handler
  useEffect(() => {
    if (!socket) return;
    
    socket.on('game_message', onGameMessage);
    
    return () => {
      socket.off('game_message', onGameMessage);
    };
  }, [socket, onGameMessage]);

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

  return {
    trickTimeoutRef
  };
};
