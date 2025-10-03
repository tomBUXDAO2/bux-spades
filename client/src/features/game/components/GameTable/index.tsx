// Modularized GameTable component
// This is a simplified version that uses the extracted components

import React, { useState, useEffect, useRef } from "react";
import type { GameState, Card, Player, Bot } from '../../types/game';
import type { ChatMessage } from '../Chat';
import Chat from '../Chat';
import LandscapePrompt from '../../LandscapePrompt';

// Extracted components
import { useAudioManager } from '../components/AudioManager';
import { PlayerHandRenderer, SpectatorHandRenderer } from '../components/CardRenderer';
import { GameStatusOverlay } from '../components/GameStatusOverlay';
import { ModalManager } from '../components/ModalManager';
import { useGameEventHandlers } from '../components/GameEventHandlers';

// Existing components
import GameTableHeader from '../components/GameTableHeader';
import GameTableScoreboard from '../components/GameTableScoreboard';
import GameTablePlayers from '../components/GameTablePlayers';
import CoinDebitAnimation from '../components/CoinDebitAnimation';
import EmojiTravel from '../components/EmojiTravel';

// Utility imports
import { getTrickCardPositions, getOrderedPlayersForTrick } from '../utils/trickUtils';
import { rotatePlayersForCurrentView } from '../utils/playerUtils';
import { getScaleFactor } from '../utils/scaleUtils';
import { handleGameOver } from '../utils/gameOverUtils';
import { handlePlayCard } from '../utils/playCardUtils';
import { handleStartGame } from '../utils/startGameUtils';
import { handleBid } from '../utils/bidUtils';
import { getUserTeam } from '../utils/gameUtils';
import { getReadyButtonData, getStartGameButtonData, getPlayerStatusData } from '../utils/leagueUtils';
import { useSocket } from '../../context/SocketContext';
import { useWindowSize } from '../../hooks/useWindowSize';
import { createPortal } from 'react-dom';

interface GameTableModularProps {
  game: GameState;
  gameId?: string;
  joinGame: (gameId: string, userId: string, options?: any) => void;
  onLeaveTable: () => void;
  startGame: (gameId: string, userId?: string) => Promise<void>;
  user?: any;
  showStartWarning?: boolean;
  showBotWarning?: boolean;
  onCloseStartWarning?: () => void;
  onCloseBotWarning?: () => void;
  emptySeats?: number;
  botCount?: number;
  isSpectator?: boolean;
  shouldShowRejoinButton?: boolean;
  onRejoinGame?: () => void;
  testAnimatingTrick?: boolean;
  testTrickWinner?: number | null;
}

export default function GameTableModular({ 
  game, 
  joinGame, 
  onLeaveTable,
  startGame,
  user: propUser,
  gameId,
  showStartWarning = false,
  showBotWarning = false,
  onCloseStartWarning,
  onCloseBotWarning,
  emptySeats = 0,
  botCount = 0,
  isSpectator = false,
  testAnimatingTrick = false,
  testTrickWinner = null
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
  const [showStartWarningModal, setShowStartWarningModal] = useState(false);
  const [showTrickHistory, setShowTrickHistory] = useState(false);
  const [showGameInfo, setShowGameInfo] = useState(false);
  
  // Game data
  const [handSummaryData, setHandSummaryData] = useState<any>(null);
  const [finalScores, setFinalScores] = useState<{ team1Score: number; team2Score: number } | null>(null);
  const [finalPlayerScores, setFinalPlayerScores] = useState<number[] | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  
  // Animation states
  const [animatingTrick, setAnimatingTrick] = useState(false);
  const [animatedTrickCards, setAnimatedTrickCards] = useState<Card[]>([]);
  const [trickWinner, setTrickWinner] = useState<number | null>(null);
  const [trickCompleted, setTrickCompleted] = useState(false);
  const [lastNonEmptyTrick, setLastNonEmptyTrick] = useState<Card[]>([]);
  const [pendingPlayedCard, setPendingPlayedCard] = useState<Card | null>(null);
  
  // League states
  const [leagueReady, setLeagueReady] = useState<boolean[]>([false, false, false, false]);
  const [isStarting, setIsStarting] = useState(false);
  
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
  const myPlayerIndex = gameState.players ? gameState.players?.findIndex(p => p && p.id === propUser?.id) : -1;
  const myHand = Array.isArray((gameState as any).hands) ? (gameState as any).hands[myPlayerIndex] || [] : [];
  const sanitizedPlayers = (gameState.players || []);
  const currentPlayer = sanitizedPlayers.find((p): p is Player | Bot => !!p && p.id === currentPlayerId) || null;
  const orderedPlayers = rotatePlayersForCurrentView(sanitizedPlayers, currentPlayer);
  const scaleFactor = getScaleFactor(windowSize);
  const isMobile = windowSize.isMobile;
  const isVerySmallScreen = windowSize.height <= 349;
  const isLeague = (gameState as any).league;
  const isHost = isLeague && gameState.players?.[0]?.id === propUser?.id;
  
  // Calculate scores
  const team1Score = handSummaryData?.team1TotalScore ?? gameState.team1TotalScore ?? 0;
  const team2Score = handSummaryData?.team2TotalScore ?? gameState.team2TotalScore ?? 0;
  const team1Bags = ((handSummaryData?.team1Bags ?? gameState.team1Bags) ?? 0) % 10;
  const team2Bags = ((handSummaryData?.team2Bags ?? gameState.team2Bags) ?? 0) % 10;
  
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
        setIsStarting(false);
      }
    }
  };
  
  const handleGameStarted = (data: any) => {
    if (data.hands || (data.status === "BIDDING" && gameState.hands)) {
      const handsArray = data.hands.map((h: any) => h.hand);
      setGameState(prev => ({ ...prev, hands: handsArray, status: data.status || "BIDDING", currentPlayer: data.currentPlayer }));
      setDealingComplete(true);
      setBiddingReady(false);
      setCardsRevealed(false);
      setIsStarting(false);
    }
  };
  
  const handleHandCompleted = (data: any) => {
    if (data && data.scores) {
      setHandSummaryData(data.scores);
    }
    setShowHandSummary(true);
  };
  
  const handleGameOverWrapper = async (data: { team1Score: number; team2Score: number; winningTeam: 1 | 2; playerScores?: number[] }) => {
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
    const trickCards = data.trick?.cards ?? data.completedTrick?.cards ?? [];
    
    if (typeof winnerIndex === 'number') {
      setAnimatedTrickCards(trickCards);
      setTrickWinner(winnerIndex);
      setAnimatingTrick(true);
      setTrickCompleted(true);
      setLastNonEmptyTrick(trickCards);
      
      // Wait 2 seconds before clearing trick animation
      setTimeout(() => {
        setAnimatingTrick(false);
        setTrickWinner(null);
        setAnimatedTrickCards([]);
        setTrickCompleted(false);
        setLastNonEmptyTrick([]);
      }, 1000);
    }
  };
  
  const handleClearTableCards = () => {
    setAnimatedTrickCards([]);
    setLastNonEmptyTrick([]);
    setTrickWinner(null);
    setAnimatingTrick(false);
    setTrickCompleted(false);
  };
  
  const handleSocketError = (error: { message: string }) => {
    if (typeof error?.message === 'string' && error.message.includes('spades')) {
      setPendingPlayedCard(null);
      alert(error.message);
    }
  };
  
  const handleEmojiReactionEvent = (data: { playerId: string; emoji: string }) => {
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
    if (!message || message.userId === 'system') return;
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
  
  const handleLeagueReadyUpdate = (payload: { gameId: string; leagueReady: boolean[] }) => {
    if (payload.gameId === gameState.id) setLeagueReady(payload.leagueReady);
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
  
  const handleGameClosed = (data: { reason: string }) => {
    console.log('[GAME CLOSED] Game was closed:', data.reason);
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
  
  // Game action handlers
  const handlePlayCardWrapper = (card: Card) => {
    handlePlayCard(card, currentPlayerId, currentPlayer, gameState, socket, {
      setGameState,
      setPendingPlayedCard,
      playCardSound
    });
  };
  
  const handleBidWrapper = (bid: number) => {
    handleBid(bid, currentPlayerId, currentPlayer, gameState, socket, {
      playBidSound,
      setCardsRevealed,
      isBlindNil: false
    });
  };
  
  const handleStartGameWrapper = async () => {
    await handleStartGame(gameState.players || [], gameState.id, socket, {
      setIsStarting,
      setShowStartWarningModal
    });
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
      socket.emit('remove_bot', {
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
    setIsStarting(true);
    onCloseBotWarning?.();
    if (socket && gameState?.id) {
      socket.emit('start_game', { gameId: gameState.id });
    }
  };
  
  const handlePlayWithBots = async () => {
    setIsStarting(true);
    const emptySeatIndexes = (gameState.players || []).map((p, i) => p ? null : i).filter(i => i !== null);
    for (const seatIndex of emptySeatIndexes) {
      await handleInviteBot(seatIndex);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    setShowStartWarningModal(false);
    await new Promise(resolve => setTimeout(resolve, 400));
    if (socket && gameState?.id) {
      socket.emit('start_game', { gameId: gameState.id });
    }
  };
  
  const handleCloseStartWarning = () => {
    setShowStartWarningModal(false);
    setIsStarting(false);
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
      socket.emit('league_ready', { gameId: gameState.id, ready });
    }
  };
  
  const requestStart = () => {
    if (socket) {
      socket.emit('start_game', { gameId: gameState.id });
    }
  };
  
  const myIndex = gameState.players?.findIndex(p => p && p.id === propUser?.id);
  const allHumansReady = gameState.players?.every((p, i) => {
    if (!isPlayer(p)) return true;
    if (i === myIndex) return true;
    return !!leagueReady[i];
  });
  
  // Trick card rendering
  const renderTrickCards = () => {
    let displayTrick = animatingTrick ? animatedTrickCards : ((gameState as any)?.play?.currentTrick || []);
    
    if (!displayTrick.length && lastNonEmptyTrick.length && gameState?.play?.currentTrick?.length > 0) {
      displayTrick = lastNonEmptyTrick;
    }
    
    if (!displayTrick.length) return null;
    
    const positions = getTrickCardPositions();
    const { seatOrderedPlayers, mySeatIndex, referenceSeatIndex, orderedPlayers } = getOrderedPlayersForTrick(gameState, propUser?.id || '');
    
    return Array.isArray(displayTrick) ? displayTrick.map((card: any, i: number) => {
      const seatIndex = card.seatIndex ?? card.playerIndex;
      const displayPosition = orderedPlayers.findIndex(p => p && (p.position === seatIndex || p.seatIndex === seatIndex));
      
      if (displayPosition === -1 || displayPosition === undefined) return null;
      
      const isWinningCard = (testAnimatingTrick || animatingTrick) && (testTrickWinner !== null || trickWinner !== null) && seatIndex === (testTrickWinner ?? trickWinner);
      
      return (
        <div
          key={`${card.suit}-${card.rank}-${i}`}
          className={`${positions[displayPosition]} z-20 transition-all duration-500 ${animatingTrick ? 'opacity-80' : ''}`}
          style={{ pointerEvents: 'none' }}
        >
          <div className="transition-all duration-300">
            {/* Card rendering would go here */}
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
        {startGameButtonData.shouldShow && (
          <button
            onClick={startGameButtonData.onClick}
            disabled={startGameButtonData.disabled}
            className={startGameButtonData.className}
          >
            Start Game
          </button>
        )}
        <div className="mt-1 text-xs text-slate-300 bg-slate-800/90 rounded px-3 py-2 w-[220px]">
          {playerStatusData.map((player) => (
            <div key={player.index} className="flex items-center gap-2 justify-start">
              <span className={`inline-block w-2 h-2 rounded-full ${player.isReady ? 'bg-green-500' : 'bg-slate-500'}`}></span>
              <span className="truncate">{player.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
    return createPortal(content, document.body);
  };
  
  // Update game state when prop changes
  useEffect(() => {
    setGameState(game);
  }, [game]);
  
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
          showStartWarningModal={showStartWarningModal}
          showBotWarning={showBotWarning}
          showGameInfo={showGameInfo}
          handSummaryData={handSummaryData}
          finalScores={finalScores}
          finalPlayerScores={finalPlayerScores}
          seatReplacement={seatReplacement}
          emptySeats={emptySeats}
          botCount={botCount}
          isStarting={isStarting}
          selectedPlayer={selectedPlayer}
          onCloseHandSummary={() => setShowHandSummary(false)}
          onCloseTrickHistory={() => setShowTrickHistory(false)}
          onClosePlayerStats={() => setShowPlayerStats(false)}
          onCloseLeaveConfirmation={() => setShowLeaveConfirmation(false)}
          onCloseWinner={() => setShowWinner(false)}
          onCloseLoser={() => setShowLoser(false)}
          onCloseStartWarning={handleCloseStartWarning}
          onCloseBotWarning={onCloseBotWarning || (() => {})}
          onCloseSeatReplacement={handleCloseSeatReplacement}
          onCloseGameInfo={() => setShowGameInfo(false)}
          onHandSummaryContinue={handleHandSummaryContinue}
          onPlayAgain={handlePlayAgain}
          onLeaveTable={handleLeaveTable}
          onCancelLeave={handleCancelLeave}
          onConfirmLeave={handleConfirmLeave}
          onStartWithBots={handleStartWithBots}
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

        {renderLeagueOverlay()}
      </div>
    </>
  );
}
