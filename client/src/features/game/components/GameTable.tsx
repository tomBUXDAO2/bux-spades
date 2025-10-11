// Modularized GameTable component
// This is a simplified version that uses the extracted components

import React, { useState, useEffect, useRef } from "react";
import type { GameState, Card, Player, Bot } from '../../../types/game';
import type { ChatMessage } from '../../../features/chat/Chat';
import Chat from '../../../features/chat/Chat';
import LandscapePrompt from "../../../LandscapePrompt";

// Extracted components
import { useAudioManager } from '../../../components/game/components/AudioManager';
import { PlayerHandRenderer, SpectatorHandRenderer, CardImage } from '../../../components/game/components/CardRenderer';
import { getCardDimensions } from '../utils/cardUtils';
import { GameStatusOverlay } from '../../../components/game/components/GameStatusOverlay';
import { ModalManager } from '../../../components/game/components/ModalManager';
import { useGameEventHandlers } from '../../../components/game/components/GameEventHandlers';
import TableDetailsModal from './TableDetailsModal';

// Existing components
import GameTableHeader from '../../../components/game/components/GameTableHeader';
import GameTableScoreboard from '../../../components/game/components/GameTableScoreboard';
import GameTablePlayers from '../../../components/game/components/GameTablePlayers';
import CoinDebitAnimation from '../../../components/game/components/CoinDebitAnimation';
import CoinCreditAnimation from '../../../components/game/components/CoinCreditAnimation';
import EmojiTravel from '../../../components/game/components/EmojiTravel';

// Utility imports
import { getTrickCardPositions, getOrderedPlayersForTrick } from '../utils/trickUtils';
import { rotatePlayersForCurrentView } from '../utils/playerUtils';
import { getScaleFactor } from '../utils/scaleUtils';
import { handleGameOver } from '../utils/gameOverUtils';
import { handlePlayCard } from '../utils/playCardUtils';
import { handleBid } from '../utils/bidUtils';
import { getUserTeam } from '../utils/gameUtils';
import { getReadyButtonData, getStartGameButtonData, getPlayerStatusData } from '../utils/leagueUtils';
import { useSocket } from '../../../features/auth/SocketContext';
import { useWindowSize } from '../../../hooks/useWindowSize';
import { createPortal } from 'react-dom';

interface GameTableModularProps {
  game: GameState;
  gameId?: string;
  joinGame: (gameId: string, userId: string, options?: any) => void;
  onLeaveTable: () => void;
  startGame?: () => Promise<void>;
  user?: any;
  showStartWarning?: boolean;
  showBotWarning?: boolean;
  onCloseStartWarning?: () => void;
  onCloseBotWarning?: () => void;
  onStartWithBots?: () => void;
  onStartWithBotsFromWarning?: () => void;
  emptySeats?: number;
  botCount?: number;
  isSpectator?: boolean;
  shouldShowRejoinButton?: boolean;
  onRejoinGame?: () => void;
  testAnimatingTrick?: boolean;
  testTrickWinner?: number | null;
  isStarting?: boolean;
}

export default function GameTableModular({ 
  game, 
  joinGame, 
  onLeaveTable,
  startGame: propStartGame,
  user: propUser,
  gameId,
  showStartWarning = false,
  showBotWarning = false,
  onCloseStartWarning,
  onCloseBotWarning,
  onStartWithBots,
  onStartWithBotsFromWarning,
  emptySeats = 0,
  botCount = 0,
  isSpectator = false,
  testAnimatingTrick = false,
  testTrickWinner = null,
  isStarting = false
}: GameTableModularProps) {
  const { socket, isAuthenticated, isReady } = useSocket();
  const windowSize = useWindowSize();
  
  // Audio management
  const { playCardSound, playBidSound, playWinSound } = useAudioManager();
  
  // Game state
  const [gameState, setGameState] = useState(game);
  const [dealingComplete, setDealingComplete] = useState(false);
  const [biddingReady, setBiddingReady] = useState(false);
  const [cardsRevealed, setCardsRevealed] = useState(false);
  const [dealtCardCount, setDealtCardCount] = useState(0);
  
  // Modal states
  const [showHandSummary, setShowHandSummary] = useState(false);
  const [showWinner, setShowWinner] = useState(false);
  const [showLoser, setShowLoser] = useState(false);
  const [showPlayerStats, setShowPlayerStats] = useState(false);
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);
  const [showTrickHistory, setShowTrickHistory] = useState(false);
  const [showGameInfo, setShowGameInfo] = useState(false);
  const [botWarningOpen, setBotWarningOpen] = useState(false);
  
  // Game data
  const [handSummaryData, setHandSummaryData] = useState<any>(null);
  const [finalScores, setFinalScores] = useState<{ team1Score: number; team2Score: number } | null>(null);
  const [finalPlayerScores, setFinalPlayerScores] = useState<number[] | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  
  // Animation states
  const [animatingTrick, setAnimatingTrick] = useState(false);
  const [animatedTrickCards, setAnimatedTrickCards] = useState<Card[]>([]);
  const [trickWinner, setTrickWinner] = useState<number | null>(null);
  
  // Coin animation states
  const [showCoinDeduction, setShowCoinDeduction] = useState(false);
  const [showCoinCredit, setShowCoinCredit] = useState(false);
  const [coinDeductionAmount, setCoinDeductionAmount] = useState(0);
  const [coinCreditAmount, setCoinCreditAmount] = useState(0);
  const [trickCompleted, setTrickCompleted] = useState(false);
  const [lastNonEmptyTrick, setLastNonEmptyTrick] = useState<Card[]>([]);
  const [pendingPlayedCard, setPendingPlayedCard] = useState<Card | null>(null);
  const [pendingBid, setPendingBid] = useState<{ playerId: string; bid: number } | null>(null);
  
  // League states
  const [leagueReady, setLeagueReady] = useState<boolean[]>([false, false, false, false]);
  // Use prop isStarting instead of local state
  // const [isStarting, setIsStarting] = useState(false);
  
  // Chat states
  const [chatType, setChatType] = useState<'game' | 'lobby'>('game');
  const [lobbyMessages, setLobbyMessages] = useState<ChatMessage[]>([]);
  const [recentChatMessages, setRecentChatMessages] = useState<Record<string, ChatMessage>>({});
  
  // Emoji states
  const [emojiReactions, setEmojiReactions] = useState<Record<string, { emoji: string; timestamp: number }>>({});
  const [emojiTravels, setEmojiTravels] = useState<Array<{
    id: string;
    emoji: string;
    fromPosition: { x: number; y: number };
    toPosition: { x: number; y: number };
  }>>([]);
  
  // Other states
  const [countdownPlayer, setCountdownPlayer] = useState<{playerId: string, playerIndex: number, timeLeft: number} | null>(null);
  const [showCoinDebit, setShowCoinDebit] = useState(false);
  const [coinDebitAmount, setCoinDebitAmount] = useState(0);
  const [seatReplacement, setSeatReplacement] = useState<{
    isOpen: boolean;
    seatIndex: number;
    expiresAt: number;
  }>({
    isOpen: false,
    seatIndex: -1,
    expiresAt: 0
  });
  
  // Refs
  const infoRef = useRef<HTMLDivElement>(null);
  
  // Utility functions
  const isPlayer = (p: Player | Bot | null): p is Player => {
    return !!p && typeof p === 'object' && ((('type' in p) && p.type !== 'bot') || !('type' in p));
  };
  
  const isBot = (p: Player | Bot | null): p is Bot => {
    return !!p && typeof p === 'object' && 'type' in p && p.type === 'bot';
  };
  
  // Game calculations
  const currentPlayerId = propUser?.id;
  
  const myPlayerIndex = gameState.players ? gameState.players?.findIndex(p => p && (p.id === propUser?.id || p.userId === propUser?.id)) : -1;
  
  // Get the current player's seatIndex, not array index
  const myPlayer = gameState.players ? gameState.players.find(p => p && (p.id === propUser?.id || p.userId === propUser?.id)) : null;
  const mySeatIndex = myPlayer ? myPlayer.seatIndex : -1;
  
  // Access hands by seatIndex, not array index - this is the correct way
  const myHand = Array.isArray((gameState as any).hands) && mySeatIndex >= 0 ? (gameState as any).hands[mySeatIndex] || [] : [];
  const sanitizedPlayers = (gameState.players || []);
  
  // CRITICAL FIX: Find the actual current player (whose turn it is), not the user
  const currentPlayer = sanitizedPlayers.find((p): p is Player | Bot => !!p && p.id === gameState.currentPlayer) || null;
  const orderedPlayers = rotatePlayersForCurrentView(sanitizedPlayers, currentPlayer, propUser?.id);
  const scaleFactor = getScaleFactor(windowSize);
  const isMobile = windowSize.isMobile;
  const isVerySmallScreen = windowSize.height <= 349;
  const isLeague = (gameState as any).league;
  const isHost = isLeague && gameState.players?.[0]?.id === propUser?.id;
  
  // Scores come from backend - no calculation needed
  const team1Score = gameState.team1TotalScore || 0;
  const team2Score = gameState.team2TotalScore || 0;
  const team1Bags = gameState.team1Bags || 0;
  const team2Bags = gameState.team2Bags || 0;
  
  // Derived counts for seats and bots
  const playersArray = Array.isArray(gameState.players) ? gameState.players : [];
  const occupiedSeats = playersArray.filter(Boolean).length;
  const computedEmptySeats = Math.max(0, 4 - occupiedSeats);
  const computedBotCount = playersArray.filter((p: any) => p && p.type === 'bot').length;
  
  // Event handlers
  const handleNewHandStarted = () => {
    setDealingComplete(false);
    setBiddingReady(false);
    setDealtCardCount(0);
    setCardsRevealed(false);
  };
  
  const handleGameJoined = (data: any) => {
    if (data.activeGameState) {
      if (data.activeGameState.hands && data.activeGameState.hands.length > 0) {
        const handsArray = data.activeGameState.hands.map((h: any) => h.hand || h);
        setGameState(prev => ({ 
          ...prev, 
          hands: handsArray, 
          status: data.activeGameState.status || "BIDDING",
          currentPlayer: data.activeGameState.currentPlayer || data.activeGameState.bidding?.currentPlayer,
          bidding: data.activeGameState.bidding,
          play: data.activeGameState.play,
          rules: data.activeGameState.rules
        }));
        setDealingComplete(true);
        setBiddingReady(true);
        setCardsRevealed(true);
        // setIsStarting(false); // Using prop from parent
      }
    }
  };
  
  const handleGameStarted = (data: any) => {
    if (data.hands || (data.status === "BIDDING" && gameState.hands)) {
      const handsArray = data.hands.map((h: any) => h.hand);
      setGameState(prev => ({ ...prev, hands: handsArray, status: data.status || "BIDDING", currentPlayer: data.currentPlayer }));
      setDealingComplete(true);
      setBiddingReady(true);
      setCardsRevealed(true);
      
      // Trigger coin deduction animation for rated games
      if (data.gameState?.isRated && data.gameState?.buyIn) {
        setCoinDeductionAmount(data.gameState.buyIn);
        setShowCoinDeduction(true);
        // Hide animation after 3 seconds
        setTimeout(() => setShowCoinDeduction(false), 3000);
      }
      
      // setIsStarting(false); // Using prop from parent
    }
  };
  
  const handleHandCompleted = (data: any) => {
    if (data && data.scores) {
      setHandSummaryData(data.scores);
    }
    setShowHandSummary(true);
  };
  
  // Calculate user's coin winnings based on game results
  const calculateUserWinnings = (data: { team1Score: number; team2Score: number; winningTeam: 1 | 2; playerScores?: number[] }, gameState: any, userId: string) => {
    if (!gameState.isRated || !gameState.buyIn) return 0;
    
    const buyIn = gameState.buyIn;
    
    if (gameState.gameMode === 'PARTNERS') {
      // Find user's team
      const userPlayer = gameState.players?.find((p: any) => p.userId === userId);
      if (!userPlayer) return 0;
      
      const isUserWinner = userPlayer.teamIndex === (data.winningTeam - 1); // winningTeam is 1-based, teamIndex is 0-based
      return isUserWinner ? Math.floor(buyIn * 1.8) : 0;
    } else {
      // Solo game - find user's position
      const userPlayer = gameState.players?.find((p: any) => p.userId === userId);
      if (!userPlayer || !data.playerScores) return 0;
      
      // Get all player scores with their positions
      const playerScores = data.playerScores.map((score: number, index: number) => ({ score, index }));
      playerScores.sort((a: any, b: any) => b.score - a.score);
      
      const userPosition = playerScores.findIndex((p: any) => p.index === userPlayer.seatIndex) + 1;
      
      switch (userPosition) {
        case 1: return Math.floor(buyIn * 2.6); // 1st place
        case 2: return buyIn; // 2nd place
        default: return 0; // 3rd/4th place
      }
    }
  };
  
  const handleGameOverWrapper = async (data: { team1Score: number; team2Score: number; winningTeam: 1 | 2; playerScores?: number[] }) => {
    // Trigger coin credit animation for rated games if user won
    if (gameState.isRated && gameState.buyIn && propUser?.id) {
      const userWinnings = calculateUserWinnings(data, gameState, propUser.id);
      if (userWinnings > 0) {
        setCoinCreditAmount(userWinnings);
        setShowCoinCredit(true);
        // Hide animation after 3 seconds
        setTimeout(() => setShowCoinCredit(false), 3000);
      }
    }
    
    await handleGameOver(data, gameState.id, gameState.gameMode || 'PARTNERS', {
      setFinalPlayerScores,
      setFinalScores,
      setShowHandSummary,
      setHandSummaryData,
      setShowWinner,
      setShowLoser,
      showWinner,
      showLoser
    });
  };
  
  const handleTrickComplete = (data: any) => {
    const winnerIndex = data.trick?.winnerIndex ?? data.trickWinner;
    // Get trick cards from the gameState's currentTrick (before it gets cleared)
    const trickCards = data.trick?.cards ?? data.completedTrick?.cards ?? data.gameState?.play?.currentTrick ?? [];
    
    console.log('[TRICK COMPLETE] Data received:', data);
    console.log('[TRICK COMPLETE] Winner index:', winnerIndex);
    console.log('[TRICK COMPLETE] Trick cards:', trickCards);
    
    if (typeof winnerIndex === 'number') {
      setAnimatedTrickCards(trickCards);
      setTrickWinner(winnerIndex);
      setAnimatingTrick(true);
      setTrickCompleted(true);
      setLastNonEmptyTrick(trickCards);
      
      // Play win sound effect when trick completes
      playWinSound();
      
      // Wait 1 second before clearing trick animation (reduced from 2 seconds)
      setTimeout(() => {
        console.log('[TRICK ANIMATION] Clearing trick animation after 1 second');
        setAnimatingTrick(false);
        setTrickWinner(null);
        setAnimatedTrickCards([]);
        setTrickCompleted(false);
        setLastNonEmptyTrick([]);
        
        // CRITICAL: Clear currentTrick from game state to prevent old cards showing
        // This is a backup in case the server clear_table_cards event fails
        setGameState((prevState: any) => ({
          ...prevState,
          play: {
            ...prevState.play,
            currentTrick: [] // Clear trick cards completely
          },
          currentTrickCards: [] // Also clear this field
        }));
      }, 1000);
    }
  };
  
  const handleClearTableCards = () => {
    console.log('[TRICK CLEAR] Clearing table cards from server event');
    setAnimatedTrickCards([]);
    setLastNonEmptyTrick([]);
    setTrickWinner(null);
    setAnimatingTrick(false);
    setTrickCompleted(false);
    
    // CRITICAL: Clear currentTrick from game state when new round starts
    // This prevents old trick cards from showing during bidding phase
    setGameState((prevState: any) => ({
      ...prevState,
      play: {
        ...prevState.play,
        currentTrick: [] // Clear trick cards completely
      },
      currentTrickCards: [] // Also clear this field
    }));
  };
  
  const handleSocketError = (error: { message: string }) => {
    if (typeof error?.message === 'string' && error.message.includes('spades')) {
      setPendingPlayedCard(null);
      alert(error.message);
    }
  };
  
  const handleEmojiReactionEvent = (data: { playerId: string; emoji: string }) => {
    // Play sound when receiving emoji from others
    import('../../../services/utils/soundUtils').then(({ playEmojiSound }) => {
      playEmojiSound(data.emoji);
    });
    
    setEmojiReactions(prev => ({
      ...prev,
      [data.playerId]: { emoji: data.emoji, timestamp: Date.now() }
    }));
  };
  
  const handleSendEmojiEvent = (data: { fromPlayerId: string; toPlayerId: string; emoji: string }) => {
    const fromPlayerElement = document.querySelector(`[data-player-id="${data.fromPlayerId}"]`);
    const toPlayerElement = document.querySelector(`[data-player-id="${data.toPlayerId}"]`);
    
    if (!fromPlayerElement || !toPlayerElement) return;

    const fromRect = fromPlayerElement.getBoundingClientRect();
    const toRect = toPlayerElement.getBoundingClientRect();

    const fromPosition = {
      x: fromRect.left + fromRect.width / 2,
      y: fromRect.top + fromRect.height / 2
    };

    const toPosition = {
      x: toRect.left + toRect.width / 2,
      y: toRect.top + toRect.height / 2
    };

    const travelId = `emoji-travel-${Date.now()}-${Math.random()}`;

    setEmojiTravels(prev => [...prev, {
      id: travelId,
      emoji: data.emoji,
      fromPosition,
      toPosition
    }]);

    setTimeout(() => {
      setEmojiTravels(prev => prev.filter(travel => travel.id !== travelId));
    }, 3000);
  };
  
  const handleLobbyMessage = (msg: ChatMessage) => {
    setLobbyMessages(prev => [...prev, msg]);
  };
  
  const handleGameMessage = (data: any) => {
    const message = 'gameId' in data ? data.message : data;
    if (!message) return;
    const senderId = message.userId as string;
    const chat: ChatMessage = {
      id: message.id,
      userId: senderId,
      userName: (message as any).userName,
      message: message.message,
      timestamp: message.timestamp || Date.now(),
      isGameMessage: true,
    };
    setRecentChatMessages(prev => ({ ...prev, [senderId]: chat }));
    setTimeout(() => {
      setRecentChatMessages(prev => {
        const current = prev[senderId];
        if (current && current.id === chat.id) {
          const copy = { ...prev };
          delete copy[senderId];
          return copy;
        }
        return prev;
      });
    }, 4500);
  };
  
  const handleLeagueReadyUpdate = (payload: { gameId: string; readyStates: Record<string, boolean> }) => {
    if (payload.gameId === gameState.id) {
      // Convert readyStates object to array indexed by seat
      const readyArray = [false, false, false, false];
      gameState.players?.forEach((player, idx) => {
        if (player && player.id) {
          readyArray[idx] = payload.readyStates[player.id] || false;
        }
      });
      setLeagueReady(readyArray);
    }
  };
  
  const handleLeagueStartDenied = (p: any) => {
    console.log('Start denied', p);
  };
  
  const handleSeatReplacementStarted = (data: { gameId: string; seatIndex: number; expiresAt: number }) => {
    setSeatReplacement({
      isOpen: true,
      seatIndex: data.seatIndex,
      expiresAt: data.expiresAt
    });
  };
  
  const handleGameClosed = (data: { reason?: string; message?: string }) => {
    console.log('[GAME CLOSED] ✅ Event received! Data:', data);
    // Set closure message for lobby to display after redirect
    try {
      const msg = data?.message || 'Your table was closed due to inactivity.';
      console.log('[GAME CLOSED] Setting localStorage message:', msg);
      localStorage.setItem('tableClosureMessage', msg);
      console.log('[GAME CLOSED] localStorage set, value:', localStorage.getItem('tableClosureMessage'));
    } catch (err) {
      console.error('[GAME CLOSED] Failed to set closure message:', err);
    }
    // Redirect to lobby
    console.log('[GAME CLOSED] Redirecting to lobby...');
    window.location.href = '/';
  };
  
  // Use event handlers hook
  useGameEventHandlers({
    socket,
    gameState,
    user: propUser,
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
    setPendingBid,
    setTrickCompleted,
    setLastNonEmptyTrick,
    setPendingPlayedCard,
    setLeagueReady,
    setSeatReplacement,
    setLobbyMessages,
    setRecentChatMessages,
    onNewHandStarted: handleNewHandStarted,
    onGameJoined: handleGameJoined,
    onGameStarted: handleGameStarted,
    onHandCompleted: handleHandCompleted,
    onGameOver: handleGameOverWrapper,
    onTrickComplete: handleTrickComplete,
    onClearTableCards: handleClearTableCards,
    onSocketError: handleSocketError,
    onEmojiReaction: handleEmojiReactionEvent,
    onSendEmoji: handleSendEmojiEvent,
    onLobbyMessage: handleLobbyMessage,
    onGameMessage: handleGameMessage,
    onLeagueReadyUpdate: handleLeagueReadyUpdate,
    onLeagueStartDenied: handleLeagueStartDenied,
    onSeatReplacementStarted: handleSeatReplacementStarted,
    onGameClosed: handleGameClosed,
    isPlayer,
    isBot
  });
  
  // Reveal my cards and enable bidding when it's my turn in BIDDING and hands are present
  useEffect(() => {
    const hands = (gameState as any)?.hands;
    // CRITICAL FIX: Use mySeatIndex instead of myPlayerIndex to access hands
    const myHandArr = Array.isArray(hands) && mySeatIndex >= 0 ? hands[mySeatIndex] : null;
    if (
      gameState?.status === 'BIDDING' &&
      gameState?.currentPlayer === currentPlayerId &&
      Array.isArray(hands) &&
      Array.isArray(myHandArr) &&
      myHandArr.length > 0
    ) {
      setDealingComplete(true);
      setCardsRevealed(true);
    }
  }, [gameState?.status, gameState?.currentPlayer, (gameState as any)?.hands, currentPlayerId, mySeatIndex]);
  
  // Game action handlers
  const handlePlayCardWrapper = (card: Card) => {
    handlePlayCard(card, currentPlayerId, currentPlayer, gameState, socket, {
      setGameState,
      setPendingPlayedCard,
      playCardSound
    });
  };
  
  const handleBidWrapper = (bid: number) => {
    console.log('[SIMPLE HUMAN BID] Human bid:', currentPlayerId, 'bid:', bid);
    
    // Simple: just show the bid and let server handle the rest
    if (currentPlayerId) {
      setPendingBid({ playerId: currentPlayerId, bid });
    }
    
    // Let server handle the rest
    handleBid(bid, currentPlayerId, currentPlayer, gameState, socket, {
      playBidSound,
      setCardsRevealed,
      isBlindNil: false
    });
  };

  // SIMPLIFIED BIDDING: Just track if we're in bidding phase
  const [isBiddingPhase, setIsBiddingPhase] = useState(false);

  // Reset when game status changes
  useEffect(() => {
    if (gameState.status === 'BIDDING') {
      setIsBiddingPhase(true);
      setPendingBid(null);
    } else {
      setIsBiddingPhase(false);
      setPendingBid(null);
    }
  }, [gameState.status]);

  // SIMPLE BOT BIDDING: Only trigger once per bot turn
  useEffect(() => {
    if (!isBiddingPhase || !gameState.currentPlayer) return;
    
    const currentPlayer = gameState.players.find(p => p && p.id === gameState.currentPlayer);
    if (currentPlayer && currentPlayer.type === 'bot') {
      console.log('[SIMPLE BOT BID] Bot turn:', currentPlayer.username);
      
      // Simple delay then bid
      const timeoutId = setTimeout(() => {
        const playerIndex = gameState.players.findIndex(p => p && p.id === currentPlayer.id);
        const hand = gameState.hands?.[playerIndex] || [];
        const spadesCount = hand.filter((card: any) => card.suit === 'SPADES').length;
        const botBid = Math.min(4, Math.max(1, spadesCount + Math.floor(Math.random() * 2)));
        
        setPendingBid({ playerId: currentPlayer.id, bid: botBid });
        playBidSound();
        
        console.log('[SIMPLE BOT BID] Bot bid:', currentPlayer.username, 'bid:', botBid);
      }, 500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [gameState.currentPlayer, isBiddingPhase, playBidSound]);
  
  // Consolidated start game function
  const startGame = async (options: { rated?: boolean } = {}) => {
    // If a prop startGame function is provided, use it instead
    if (propStartGame) {
      await propStartGame();
      return;
    }

    if (!socket || !gameState?.id) return;
    
    // CRITICAL: Set isStarting and NEVER unset it - button should disappear forever
    // setIsStarting(true); // Using prop from parent
    const players = Array.isArray(gameState.players) ? gameState.players : [];
    const occupied = players.filter(Boolean).length;
    const emptySeatCount = Math.max(0, 4 - occupied);
    const hasBotPlayers = players.some((p: any) => p && p.type === 'bot');

    // Case 1: Empty seats → warn, then fill with bots and start
    if (emptySeatCount > 0) {
      // This should not happen since propStartGame should be used instead
      return;
    }

    // Case 2: No empty seats but bots present → warn unrated then start on continue
    if (hasBotPlayers && !options.rated) {
      // DON'T set isStarting to false - keep button hidden
      setGameState((prev: any) => ({ ...prev, ui: { ...(prev?.ui || {}), showBotWarning: true } }));
      setBotWarningOpen(true);
      return;
    }

    // Case 3: Start game directly
    socket.emit('start_game', { 
      gameId: gameState.id, 
      rated: options.rated || false 
    });
  };

  const handleStartGameWrapper = async () => {
    await startGame({ rated: true });
  };
  
  const handleLeaveTable = () => {
    setShowLeaveConfirmation(true);
  };
  
  const handleConfirmLeave = () => {
    setShowLeaveConfirmation(false);
    if (socket && gameState?.id && propUser?.id) {
      socket.emit('leave_game', { gameId: gameState.id, userId: propUser.id });
    }
    onLeaveTable();
  };
  
  const handleCancelLeave = () => {
    setShowLeaveConfirmation(false);
  };
  
  const handlePlayAgain = () => {
    if (socket) {
      socket.emit('play_again', { gameId: gameState.id });
    }
  };
  
  const handleHandSummaryContinue = () => {
    setShowHandSummary(false);
    setHandSummaryData(null);
    if (socket && gameState.id) {
      socket.emit('hand_summary_continue', { gameId: gameState.id });
    }
  };
  
  const handleViewPlayerStats = (player: any) => {
    setSelectedPlayer(player);
    setShowPlayerStats(true);
  };
  
  const handleEmojiReaction = (playerId: string, emoji: string) => {
    // Play sound for the emoji
    import('../../../services/utils/soundUtils').then(({ playEmojiSound }) => {
      playEmojiSound(emoji);
    });
    
    if (socket && gameState?.id) {
      socket.emit('emoji_reaction', {
        gameId: gameState.id,
        playerId: playerId,
        emoji: emoji
      });
    }
    setEmojiReactions(prev => ({
      ...prev,
      [playerId]: { emoji, timestamp: Date.now() }
    }));
  };
  
  const handleEmojiComplete = (playerId: string) => {
    setEmojiReactions(prev => {
      const newReactions = { ...prev };
      delete newReactions[playerId];
      return newReactions;
    });
  };
  
  const handleSendEmoji = (targetPlayerId: string, emoji: string) => {
    // Play sound for the emoji
    import('../../../services/utils/soundUtils').then(({ playEmojiSound }) => {
      playEmojiSound(emoji);
    });
    
    if (socket && gameState?.id && propUser?.id) {
      socket.emit('send_emoji', {
        gameId: gameState.id,
        fromPlayerId: propUser.id,
        toPlayerId: targetPlayerId,
        emoji: emoji
      });
    }
  };
  
  const handleInviteBot = async (seatIndex: number) => {
    if (socket) {
      socket.emit('invite_bot', {
        gameId: gameState.id,
        seatIndex: seatIndex
      });
    }
  };
  
  const handleRemoveBot = async (seatIndex: number) => {
    if (socket) {
      socket.emit('remove_bot_db', {
        gameId: gameState.id,
        seatIndex: seatIndex
      });
    }
  };
  
  const handleFillSeatWithBot = () => {
    if (socket) {
      socket.emit('add_bot', {
        gameId: gameState.id,
        seatIndex: seatReplacement.seatIndex
      });
    }
    setSeatReplacement(prev => ({ ...prev, isOpen: false }));
  };
  
  const handleCloseSeatReplacement = () => {
    setSeatReplacement(prev => ({ ...prev, isOpen: false }));
  };
  
  const handleStartWithBots = async () => {
    setBotWarningOpen(false);
    if (onStartWithBots) {
      await onStartWithBots();
    } else {
      startGame({ rated: false });
    }
  };
  
  const handlePlayWithBots = async () => {
    // setIsStarting(true); // Using prop from parent
    const playersArr = Array.isArray(gameState.players) ? gameState.players : [];
    const emptySeatIndexes: number[] = [];
    for (let i = 0; i < 4; i++) {
      const seatPlayer = playersArr[i];
      if (!seatPlayer) emptySeatIndexes.push(i);
    }
    for (const seatIndex of emptySeatIndexes) {
      await handleInviteBot(seatIndex);
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    onCloseStartWarning?.();
    await new Promise(resolve => setTimeout(resolve, 500));
    startGame({ rated: false });
  };
  
  const handleCloseStartWarning = () => {
    onCloseStartWarning?.();
    // setIsStarting(false); // Using prop from parent
  };

  const handleCloseBotWarning = () => {
    setBotWarningOpen(false);
    // setIsStarting(false); // Using prop from parent
    setGameState((prev: any) => ({ ...prev, ui: { ...(prev?.ui || {}), showBotWarning: false } }));
  };
  
  const handleTimerExpire = () => {
    if (socket && gameState?.id && propUser?.id) {
      socket.emit('leave_game', { gameId: gameState.id, userId: propUser.id });
    }
    onLeaveTable();
  };
  
  // League handlers
  const toggleReady = (ready: boolean) => {
    if (socket) {
      socket.emit('toggle_ready', { gameId: gameState.id, ready });
    }
  };
  
  const requestStart = () => {
    if (propStartGame) {
      propStartGame();
    } else {
      startGame({ rated: false });
    }
  };
  
  const myIndex = gameState.players?.findIndex(p => p && (p.id === propUser?.id || p.userId === propUser?.id));
  const allHumansReady = gameState.players?.every((p, i) => {
    if (!isPlayer(p)) return true;
    if (i === myIndex) return true;
    return !!leagueReady[i];
  });
  
  // Trick card rendering
  const renderTrickCards = () => {
    // CRITICAL FIX: Prioritize currentTrickCards from gameState, then play.currentTrick, then animatedTrickCards
    let displayTrick = [];
    
    if (animatingTrick && animatedTrickCards.length > 0) {
      displayTrick = animatedTrickCards;
    } else if ((gameState as any)?.currentTrickCards && Array.isArray((gameState as any).currentTrickCards)) {
      displayTrick = (gameState as any).currentTrickCards;
    } else if ((gameState as any)?.play?.currentTrick && Array.isArray((gameState as any).play.currentTrick)) {
      displayTrick = (gameState as any).play.currentTrick;
    } else if (lastNonEmptyTrick.length > 0) {
      displayTrick = lastNonEmptyTrick;
    }
    
    // Calculate table card dimensions
    const handCardDimensions = getCardDimensions(isMobile, scaleFactor);
    let tableCardWidth, tableCardHeight;
    
    if (isMobile) {
      // On mobile, use 80% of hand card size
      tableCardWidth = Math.floor(handCardDimensions.cardUIWidth * 0.8);
      tableCardHeight = Math.floor(handCardDimensions.cardUIHeight * 0.8);
    } else {
      // On desktop, use same size as hand cards
      tableCardWidth = handCardDimensions.cardUIWidth;
      tableCardHeight = handCardDimensions.cardUIHeight;
    }
    
    const positions = getTrickCardPositions();
    const { seatOrderedPlayers, mySeatIndex, referenceSeatIndex, orderedPlayers } = getOrderedPlayersForTrick(gameState, propUser?.id || '');
    
    // INSTANT RENDERING: Add pending played card for immediate feedback
    if (pendingPlayedCard && mySeatIndex >= 0) {
      const pendingCardExists = displayTrick.some((c: any) => 
        c.suit === pendingPlayedCard.suit && c.rank === pendingPlayedCard.rank
      );
      if (!pendingCardExists) {
        displayTrick = [...displayTrick, { ...pendingPlayedCard, seatIndex: mySeatIndex }];
      }
    }
    
    // Return null if no cards to display (check AFTER adding pending card)
    if (!displayTrick.length) {
      return null;
    }
    
    return Array.isArray(displayTrick) ? displayTrick.map((card: any, i: number) => {
      const seatIndex = card.seatIndex ?? card.playerIndex;
      
      // Calculate display position based on seat index relative to current user
      let displayPosition = -1;
      if (mySeatIndex >= 0) {
        displayPosition = (seatIndex - mySeatIndex + 4) % 4;
      } else {
        // For spectators, use seat index directly
        displayPosition = seatIndex;
      }
      
      console.log(`[RENDER TRICK CARDS] Card ${i}:`, card);
      console.log(`[RENDER TRICK CARDS] seatIndex: ${seatIndex}, mySeatIndex: ${mySeatIndex}, displayPosition: ${displayPosition}`);
      
      if (displayPosition < 0 || displayPosition > 3) {
        console.log(`[RENDER TRICK CARDS] Returning null for card ${i} - invalid displayPosition: ${displayPosition}`);
        return null;
      }
      
      const isWinningCard = (testAnimatingTrick || animatingTrick) && (testTrickWinner !== null || trickWinner !== null) && seatIndex === (testTrickWinner ?? trickWinner);
      
      return (
        <div
          key={`${card.suit}-${card.rank}-${i}`}
          className={`${positions[displayPosition]} z-20 transition-all duration-500 ${animatingTrick ? 'opacity-80' : ''}`}
          style={{ pointerEvents: 'none' }}
        >
          <div className="transition-all duration-300">
            <CardImage
              card={card}
              width={tableCardWidth}
              height={tableCardHeight}
              className="shadow-lg"
              alt={`${card.rank}${card.suit}`}
            />
          </div>
          {isWinningCard && (
            <div className="absolute -top-2 -right-2 bg-yellow-400 text-black rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold animate-pulse">
              ✓
            </div>
          )}
        </div>
      );
    }) : [];
  };
  
  // League overlay
  const renderLeagueOverlay = () => {
    if (!isLeague || gameState.status !== 'WAITING') return null;
    
    const readyButtonData = getReadyButtonData(isHost, myIndex, gameState, leagueReady, toggleReady);
    const startGameButtonData = getStartGameButtonData(isHost, allHumansReady, requestStart);
    const playerStatusData = getPlayerStatusData(gameState, leagueReady);
    
    const content = (
      <div className="fixed z-[100000] flex flex-col items-center gap-2 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        {readyButtonData.shouldShow && (
          <button
            onClick={readyButtonData.onClick}
            className={readyButtonData.className}
          >
            {readyButtonData.text}
          </button>
        )}
        {startGameButtonData.shouldShow && !showStartWarning && !showBotWarning && (
          <button
            onClick={startGameButtonData.onClick}
            disabled={startGameButtonData.disabled}
            className={startGameButtonData.className}
          >
            Start Game
          </button>
        )}
        {!startGameButtonData.shouldShow && (
          <div className="mt-1 text-xs text-slate-300 bg-slate-800/90 rounded px-3 py-2 w-[220px]">
            {playerStatusData.map((player) => (
              <div key={player.index} className="flex items-center gap-2 justify-start">
                <span className={`inline-block w-2 h-2 rounded-full ${player.isReady ? 'bg-green-500' : 'bg-slate-500'}`}></span>
                <span className="truncate">{player.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
    return createPortal(content, document.body);
  };
  
  // Update game state when prop changes
  useEffect(() => {
    setGameState(game);
  }, [game]);
  
  // Listen for ready state updates
  useEffect(() => {
    if (!socket) return;
    
    socket.on('player_ready_update', handleLeagueReadyUpdate);
    
    return () => {
      socket.off('player_ready_update', handleLeagueReadyUpdate);
    };
  }, [socket, gameState.id]);
  
  const chatReady = Boolean(gameState?.id);
  
  return (
    <>
      <LandscapePrompt />
      <div className="fixed inset-0 bg-gray-900">
        {/* Main content area - full height */}
        <div className="flex h-full">
          {/* Game table area - add padding on top and bottom */}
          <div className="w-[70%] p-2 flex flex-col h-full">
            {/* Game table with more space top and bottom */}
            <div className="relative mb-2" style={{
              background: 'radial-gradient(circle at center, #316785 0%, #1a3346 100%)',
              borderRadius: `${Math.floor(64 * scaleFactor)}px`,
              border: `${Math.floor(2 * scaleFactor)}px solid #855f31`,
              height: isMobile ? 'calc(100% - 80px)' : (window.innerWidth >= 900 ? 'calc(100% - 100px)' : 'calc(100% - 200px)')
            }}>
              {/* Trick cards overlay - covers the whole table area */}
              <div className="absolute inset-0 pointer-events-none z-20">
                {renderTrickCards()}
              </div>
              
              {/* Game Table Header */}
              <GameTableHeader
                scaleFactor={scaleFactor}
                infoRef={infoRef}
                onLeaveTable={handleLeaveTable}
                onToggleGameInfo={() => setShowGameInfo((v) => !v)}
                onShowTrickHistory={() => setShowTrickHistory(true)}
              />
              
              {/* Game Table Scoreboard */}
              <GameTableScoreboard
                gameState={gameState}
                isVerySmallScreen={isVerySmallScreen}
                team1Score={team1Score}
                team1Bags={team1Bags}
                team2Score={team2Score}
                team2Bags={team2Bags}
              />
        
              {/* Players around the table */}
              <GameTablePlayers
                gameState={gameState}
                user={propUser}
                orderedPlayers={orderedPlayers}
                sanitizedPlayers={sanitizedPlayers}
                currentPlayerId={currentPlayerId}
                myPlayerIndex={myPlayerIndex}
                countdownPlayer={countdownPlayer}
                isVerySmallScreen={isVerySmallScreen}
                isMobile={isMobile}
                windowSize={windowSize}
                pendingBid={pendingBid}
                scaleFactor={scaleFactor}
                invitingBotSeat={null}
                joinGame={joinGame}
                handleInviteBot={handleInviteBot}
                handleRemoveBot={handleRemoveBot}
                handleViewPlayerStats={handleViewPlayerStats}
                handleEmojiReaction={(playerId: string, emoji: string) => handleEmojiReaction(playerId, emoji)}
                handleEmojiComplete={handleEmojiComplete}
                handleSendEmoji={(targetPlayerId: string, emoji: string) => handleSendEmoji(targetPlayerId, emoji)}
                emojiReactions={emojiReactions}
                showCoinDebit={showCoinDebit}
                coinDebitAmount={coinDebitAmount}
                recentChatMessages={recentChatMessages as Record<string, { message: string; timestamp: number }>}
                isPlayer={isPlayer}
                isBot={isBot}
              />

              {/* Game Status Overlay */}
              <GameStatusOverlay
                gameState={gameState}
                currentPlayerId={currentPlayerId}
                sanitizedPlayers={sanitizedPlayers}
                scaleFactor={scaleFactor}
                isLeague={isLeague}
                isStarting={isStarting}
                dealingComplete={dealingComplete}
                cardsRevealed={cardsRevealed}
                showBlindNilModal={false}
                isBlindNil={false}
                blindNilDismissed={false}
                myPlayerIndex={myPlayerIndex}
                currentPlayer={currentPlayer}
                isPlayer={isPlayer}
                isBot={isBot}
                showLeaveConfirmation={showLeaveConfirmation}
                showTrickHistory={showTrickHistory}
                showStartWarning={showStartWarning}
                showBotWarning={showBotWarning}
                onStartGame={handleStartGameWrapper}
                onBid={handleBidWrapper}
                onBlindNil={() => {}}
                onRegularBid={() => {}}
              />
            </div>

            {/* Cards area - show for actual players or face-down cards for spectators */}
            {(myPlayerIndex !== -1 || (myPlayerIndex === -1 && gameState.status !== "WAITING")) && (
              <div className="bg-gray-800/50 rounded-lg relative mb-0 mt-auto" 
                   style={{ 
                        height: `${Math.floor((window.innerWidth < 900 ? 77 : (window.innerWidth >= 900 && window.innerWidth <= 1300 ? 140 : 168)) * scaleFactor + 20)}px`
                   }}>
                {myPlayerIndex !== -1 ? (
                  <PlayerHandRenderer
                    gameState={gameState}
                    myHand={myHand}
                    currentPlayerId={currentPlayerId}
                    isMobile={isMobile}
                    scaleFactor={scaleFactor}
                    cardsRevealed={cardsRevealed}
                    dealingComplete={dealingComplete}
                    dealtCardCount={dealtCardCount}
                    currentTrick={(gameState as any)?.play?.currentTrick || []}
                    trickCompleted={trickCompleted}
                    onPlayCard={handlePlayCardWrapper}
                    isPlayer={isPlayer}
                    isBot={isBot}
                  />
                ) : (
                  <SpectatorHandRenderer
                    gameState={gameState}
                    isMobile={isMobile}
                    scaleFactor={scaleFactor}
                  />
                )}
              </div>
            )}
          </div>

          {/* Chat area - 30%, full height */}
          <div className="w-[30%] h-full overflow-hidden">
            {chatReady ? (
              <Chat 
                gameId={gameState.id}
                userId={propUser?.id || ''}
                userName={propUser?.username || 'Unknown'}
                players={sanitizedPlayers.filter((p): p is Player => isPlayer(p))}
                userAvatar={propUser?.avatarUrl || propUser?.avatar}
                chatType={chatType}
                onToggleChatType={() => setChatType(chatType === 'game' ? 'lobby' : 'game')}
                lobbyMessages={lobbyMessages}
                gameMessages={recentChatMessages}
                spectators={(gameState as any).spectators || []}
                isSpectator={isSpectator}
                onPlayerClick={handleViewPlayerStats}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 text-lg">Connecting chat...</div>
            )}
          </div>
        </div>

      {/* Table Details Modal */}
      <TableDetailsModal
        isOpen={showGameInfo}
        gameState={gameState}
      />

      {/* Modal Manager */}
      <ModalManager
          gameState={gameState}
          user={propUser}
          showHandSummary={showHandSummary}
          showTrickHistory={showTrickHistory}
          showPlayerStats={showPlayerStats}
          showLeaveConfirmation={showLeaveConfirmation}
          showWinner={showWinner}
          showLoser={showLoser}
          showStartWarningModal={showStartWarning}
          showBotWarning={botWarningOpen}
          handSummaryData={handSummaryData}
          finalScores={finalScores}
          finalPlayerScores={finalPlayerScores}
          seatReplacement={seatReplacement}
          emptySeats={computedEmptySeats}
          botCount={computedBotCount}
          isStarting={isStarting}
          selectedPlayer={selectedPlayer}
          onCloseHandSummary={() => setShowHandSummary(false)}
          onCloseTrickHistory={() => setShowTrickHistory(false)}
          onClosePlayerStats={() => setShowPlayerStats(false)}
          onCloseLeaveConfirmation={() => setShowLeaveConfirmation(false)}
          onCloseWinner={() => setShowWinner(false)}
          onCloseLoser={() => setShowLoser(false)}
          onCloseStartWarning={handleCloseStartWarning}
          onCloseBotWarning={handleCloseBotWarning}
          onCloseSeatReplacement={handleCloseSeatReplacement}
          onHandSummaryContinue={handleHandSummaryContinue}
          onPlayAgain={handlePlayAgain}
          onLeaveTable={handleLeaveTable}
          onCancelLeave={handleCancelLeave}
          onConfirmLeave={handleConfirmLeave}
          onStartWithBots={onStartWithBots || (() => {})}
          onStartWithBotsFromWarning={onStartWithBotsFromWarning || (() => {})}
          onPlayWithBots={handlePlayWithBots}
          onFillSeatWithBot={handleFillSeatWithBot}
          onTimerExpire={handleTimerExpire}
          isPlayer={isPlayer}
          isBot={isBot}
        />

        {/* Emoji Travel Animations */}
        {emojiTravels.map((travel) => (
          <EmojiTravel
            key={travel.id}
            emoji={travel.emoji}
            fromPosition={travel.fromPosition}
            toPosition={travel.toPosition}
            onComplete={() => {
              setEmojiTravels(prev => prev.filter(t => t.id !== travel.id));
            }}
          />
        ))}

        {/* Coin Animations */}
        <CoinDebitAnimation
          amount={coinDeductionAmount}
          isVisible={showCoinDeduction}
        />
        <CoinCreditAnimation
          amount={coinCreditAmount}
          isVisible={showCoinCredit}
        />

        {renderLeagueOverlay()}
      </div>
    </>
  );
}
