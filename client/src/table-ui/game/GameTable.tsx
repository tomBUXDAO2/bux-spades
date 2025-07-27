"use client";

import { useState, useEffect, useRef } from "react";
import type { GameState, Card, Suit, Player, Bot } from '../../types/game';
import type { ChatMessage } from '../Chat';
import BlindNilModal from './BlindNilModal';
import Chat from '../Chat';
import HandSummaryModal from './HandSummaryModal';
import WinnerModal from './WinnerModal';
import LoserModal from './LoserModal';
import SoloWinnerModal from './SoloWinnerModal';
import BiddingInterface from './BiddingInterface';

import LandscapePrompt from '../../LandscapePrompt';
import { IoExitOutline, IoInformationCircleOutline } from "react-icons/io5";
import { useWindowSize } from '../../hooks/useWindowSize';
import { FaRobot } from 'react-icons/fa';
import { FaMinus } from 'react-icons/fa';
import { useSocket } from '../../context/SocketContext';
import StartGameWarningModal from '../modals/StartGameWarningModal';
import { api } from '@/lib/api';
import { isGameOver, getPlayerColor } from '../lib/gameRules';

// Sound utility for dealing cards
const playCardSound = () => {
  try {
    const audio = new Audio('/sounds/card.wav'); // Use public/sounds/card.wav
    audio.volume = 0.3;
    audio.play().catch(err => console.log('Audio play failed:', err));
  } catch (error) {
    console.log('Audio not supported or failed to load:', error);
  }
};

// Sound utility for bid
const playBidSound = () => {
  try {
    const audio = new Audio('/sounds/bid.mp3');
    audio.volume = 0.5;
    audio.play().catch(err => console.log('Audio play failed:', err));
  } catch (error) {
    console.log('Audio not supported or failed to load:', error);
  }
};

// Sound utility for win
const playWinSound = () => {
  try {
    const audio = new Audio('/sounds/win.mp3');
    audio.volume = 0.5;
    audio.play().catch(err => console.log('Audio play failed:', err));
  } catch (error) {
    console.log('Audio not supported or failed to load:', error);
  }
};

interface GameTableProps {
  game: GameState;
  joinGame: (gameId: string, userId: string, options?: any) => void;
  onLeaveTable: () => void;
  startGame: (gameId: string, userId?: string) => Promise<void>;
  user?: any;
}

// Helper function to get card image filename
function getCardImage(card: Card): string {
  if (!card) return 'back.png';
  // Accepts suit as symbol, letter, or word
  const suitMap: Record<string, string> = {
    '♠': 'S', 'Spades': 'S', 'S': 'S',
    '♥': 'H', 'Hearts': 'H', 'H': 'H',
    '♦': 'D', 'Diamonds': 'D', 'D': 'D',
    '♣': 'C', 'Clubs': 'C', 'C': 'C',
  };
  const suitLetter = suitMap[card.suit] || card.suit || 'X';
  return `${card.rank}${suitLetter}.png`;
}

// Helper function to get card rank value
function getCardValue(rank: string | number): number {
  // If rank is already a number, return it
  if (typeof rank === 'number') {
    return rank;
  }
  
  // Otherwise, convert string ranks to numbers
  const rankMap: { [key: string]: number } = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return rankMap[rank];
}

// Helper function to sort cards
function sortCards(cards: Card[]): Card[] {
  // Suit order: Diamonds, Clubs, Hearts, Spades
  const suitOrder: Record<string, number> = { '♦': 0, 'C': 1, '♣': 1, '♥': 2, 'H': 2, '♠': 3, 'S': 3 };
  return [...cards].sort((a, b) => {
    // Normalize suit to single letter for sorting
    const getSuitKey = (suit: string) => {
      if (suit === '♦' || suit === 'Diamonds' || suit === 'D') return '♦';
      if (suit === '♣' || suit === 'Clubs' || suit === 'C') return '♣';
      if (suit === '♥' || suit === 'Hearts' || suit === 'H') return '♥';
      if (suit === '♠' || suit === 'Spades' || suit === 'S') return '♠';
      return suit;
    };
    const suitA = getSuitKey(a.suit);
    const suitB = getSuitKey(b.suit);
    if (suitOrder[suitA] !== suitOrder[suitB]) {
      return suitOrder[suitA] - suitOrder[suitB];
    }
    return getCardValue(a.rank) - getCardValue(b.rank);
  });
}

// Add new helper functions after the existing ones
function getLeadSuit(trick: Card[] | undefined): Suit | null {
  if (!Array.isArray(trick) || trick.length === 0) return null;
  return trick[0].suit;
}

function hasSpadeBeenPlayed(game: GameState): boolean {
  // Check if any completed trick contained a spade
  const completedTricksHaveSpades = game.completedTricks?.some((trick: any) =>
    Array.isArray(trick.cards) && trick.cards.some((card: Card) => card.suit === '♠')
  ) || false;
  
  // Also check if current trick has spades
  const currentTrick = (game as any).play?.currentTrick || [];
  const currentTrickHasSpades = currentTrick.some((card: Card) => card.suit === '♠');
  
  return completedTricksHaveSpades || currentTrickHasSpades;
}

function canLeadSpades(game: GameState, hand: Card[]): boolean {
  // Can lead spades if:
  // 1. Spades have been broken, or
  // 2. Player only has spades left
  return hasSpadeBeenPlayed(game) || hand.every(card => card.suit === '♠');
}

function getPlayableCards(game: GameState, hand: Card[] | undefined, isLeadingTrick: boolean, trickCompleted: boolean = false): Card[] {
  if (!Array.isArray(hand) || !hand.length) return [];

  // If leading the trick
  if (isLeadingTrick) {
    // If spades haven't been broken, filter out spades unless only spades remain
    if (!canLeadSpades(game, hand)) {
      const nonSpades = hand.filter(card => card.suit !== '♠');
      return nonSpades.length > 0 ? nonSpades : hand;
    }
    return hand;
  }

  // If following
  const currentTrick = (game as any).play?.currentTrick || [];
  
  // If trick is completed but still animating, treat it as a new trick (leading)
  if (trickCompleted && currentTrick.length === 4) {
    return hand; // Allow any card since we're starting a new trick
  }
  
  const leadSuit = getLeadSuit(currentTrick);
  if (!leadSuit) return [];

  // Must follow suit if possible
  const suitCards = hand.filter(card => card.suit === leadSuit);
  return suitCards.length > 0 ? suitCards : hand;
}

// Add this near the top of the file, after imports
declare global {
  interface Window {
    lastCompletedTrick: {
      cards: Card[];
      winnerIndex: number;
      timeout: any;
    } | null;
    __sentJoinSystemMessage: string | null;
  }
}

// Helper function to count spades in a hand
const countSpades = (hand: Card[] | undefined): number => {
  if (!hand || !Array.isArray(hand)) return 0;
  return hand.filter(card => card.suit === '♠' || (card as any).suit === 'S').length;
};

// Helper function to determine if the current user can invite a bot for a seat
function canInviteBot({
  gameState,
  currentPlayerId,
  seatIndex,
  isPreGame,
  sanitizedPlayers,
}: {
  gameState: GameState;
  currentPlayerId: string;
  seatIndex: number;
  isPreGame: boolean;
  sanitizedPlayers: (Player | null)[];
}) {
  if (!currentPlayerId) return false;
  if (isPreGame) {
    // Only host (seat 0) can invite bots pre-game
    return sanitizedPlayers[0]?.id === currentPlayerId && gameState.status === 'WAITING';
  } else {
    // Mid-game: only the partner of the empty seat can invite a bot
    // Partner is seat (seatIndex + 2) % 4
    const partnerIndex = (seatIndex + 2) % 4;
    return sanitizedPlayers[partnerIndex]?.id === currentPlayerId && gameState.status === 'PLAYING';
  }
}

// Type guards for Player and Bot
function isPlayer(p: Player | Bot | null): p is Player {
  return !!p && typeof p === 'object' && ((('type' in p) && p.type !== 'bot') || !('type' in p));
}
function isBot(p: Player | Bot | null): p is Bot {
  return !!p && typeof p === 'object' && 'type' in p && p.type === 'bot';
}

// Add this utility function at the top (after imports)
const formatCoins = (value: number) => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  return `${value / 1000}k`;
};

export default function GameTable({ 
  game, 
  joinGame, 
  onLeaveTable,
  startGame,
  user: propUser
}: GameTableProps) {
  // Add dummy handlePlayAgain to fix missing reference error
  const handlePlayAgain = () => window.location.reload();

  // Function to start a new hand
  const handleStartNewHand = () => {
    console.log('[START NEW HAND] Function called');
    console.log('Socket connected:', socket?.connected);
    console.log('Game ID:', gameState.id);
    console.log('Socket ID:', socket?.id);
    console.log('Socket object:', socket);
    
    setShowHandSummary(false);
    setHandSummaryData(null);
    
    // Reset dealing state for new hand
    setDealingComplete(false);
    setBiddingReady(false);
    setDealtCardCount(0);
    
    // Reset blind nil state for new hand
    setShowBlindNilModal(false);
    setIsBlindNil(false);
    setCardsRevealed(false);
    setBlindNilDismissed(false);
    
    // Emit start new hand event to server
    if (socket && gameState.id) {
      console.log('[START NEW HAND] Emitting start_new_hand event...');
      console.log('[START NEW HAND] Socket ready state:', { connected: socket.connected, id: socket.id });
      
      if (socket.connected) {
        socket.emit('start_new_hand', { gameId: gameState.id }, (response: any) => {
          console.log('[START NEW HAND] Server response:', response);
        });
        console.log('[START NEW HAND] start_new_hand event emitted');
      } else {
        console.error('[START NEW HAND] Socket not connected, cannot emit event');
        // Try to reconnect and emit
        socket.connect();
        setTimeout(() => {
          if (socket.connected) {
            console.log('[START NEW HAND] Retrying emit after reconnect...');
            socket.emit('start_new_hand', { gameId: gameState.id }, (response: any) => {
              console.log('[START NEW HAND] Server response (retry):', response);
            });
          }
        }, 1000);
      }
    } else {
      console.error('[START NEW HAND] Cannot emit: socket or gameState.id missing', { socket: !!socket, gameId: gameState.id });
    }
  };

  // Restore user assignment
  const user = propUser;
  const { socket, isAuthenticated } = useSocket();
  const [isMobile, setIsMobile] = useState(false);
  const [showHandSummary, setShowHandSummary] = useState(false);
  const [showWinner, setShowWinner] = useState(false);
  const [showLoser, setShowLoser] = useState(false);
  const [handSummaryData, setHandSummaryData] = useState<any>(null);
  const [showStartWarning, setShowStartWarning] = useState(false);
  const [dealingComplete, setDealingComplete] = useState(false);
  const [biddingReady, setBiddingReady] = useState(false);
  const [showBlindNilModal, setShowBlindNilModal] = useState(false);
  const [isBlindNil, setIsBlindNil] = useState(false);
  const [cardsRevealed, setCardsRevealed] = useState(false);
  const [blindNilDismissed, setBlindNilDismissed] = useState(false);
  
  // Use the windowSize hook to get responsive information
  const windowSize = useWindowSize();
  
  // Use gameState for all game data
  const [gameState, setGameState] = useState(game);
  
  // Add debug logs for hand mapping
  const myPlayerIndex = gameState.players.findIndex(p => p && p.id === user?.id);
  const myHand = Array.isArray((gameState as any).hands) && myPlayerIndex >= 0 ? (gameState as any).hands[myPlayerIndex] : [];
  console.log('myPlayerIndex:', myPlayerIndex);
  console.log('gameState.hands:', (gameState as any).hands);
  console.log('myHand:', myHand);
  
  // Find the current player's ID
  const currentPlayerId = user?.id;
  
  // After getting the players array:
  const sanitizedPlayers = (gameState.players || []);
  const isObserver = !sanitizedPlayers.some((p): p is Player | Bot => !!p && p.id === currentPlayerId);
  console.log('game.players:', gameState.players); // Debug log to catch nulls

  // Find the current player's position and team
  const currentPlayer = sanitizedPlayers.find((p): p is Player | Bot => !!p && p.id === currentPlayerId) || null;
  
  // Add state to force component updates when the current player changes
  const [lastCurrentPlayer, setLastCurrentPlayer] = useState<string>(gameState.currentPlayer);
  
  // Check if blind nil modal should be shown
  useEffect(() => {
    // Don't show blind nil modal for spectators
    if (myPlayerIndex === -1) return;
    
    console.log('[BLIND NIL DEBUG] Checking blind nil modal conditions:');
    console.log('[BLIND NIL DEBUG] gameState.status:', gameState.status);
    console.log('[BLIND NIL DEBUG] gameState.currentPlayer:', gameState.currentPlayer);
    console.log('[BLIND NIL DEBUG] currentPlayerId:', currentPlayerId);
    console.log('[BLIND NIL DEBUG] dealingComplete:', dealingComplete);
    console.log('[BLIND NIL DEBUG] biddingReady:', biddingReady);
    console.log('[BLIND NIL DEBUG] gameState.rules?.allowBlindNil:', gameState.rules?.allowBlindNil);
    console.log('[BLIND NIL DEBUG] showBlindNilModal:', showBlindNilModal);
    console.log('[BLIND NIL DEBUG] isBlindNil:', isBlindNil);
    console.log('[BLIND NIL DEBUG] blindNilDismissed:', blindNilDismissed);
    console.log('[BLIND NIL DEBUG] cardsRevealed:', cardsRevealed);
    
    if (gameState.status === "BIDDING" && 
        gameState.currentPlayer === currentPlayerId && 
        dealingComplete && 
        biddingReady &&
        gameState.rules?.allowBlindNil &&
        !showBlindNilModal &&
        !isBlindNil &&
        !blindNilDismissed &&
        !cardsRevealed) {
      console.log('[BLIND NIL DEBUG] All conditions met, showing blind nil modal');
      // Show blind nil modal BEFORE revealing cards
      const timer = setTimeout(() => {
        setShowBlindNilModal(true);
      }, 1000); // 1 second delay after dealing
      
      return () => clearTimeout(timer);
    } else {
      console.log('[BLIND NIL DEBUG] Conditions not met for blind nil modal');
    }
  }, [gameState.status, gameState.currentPlayer, currentPlayerId, dealingComplete, biddingReady, isBlindNil, gameState.rules?.allowBlindNil, blindNilDismissed, cardsRevealed, myPlayerIndex]);

  // Reveal cards for regular bidding (non-blind nil games)
  useEffect(() => {
    // Don't reveal cards for spectators
    if (myPlayerIndex === -1) return;
    
    if (gameState.status === "BIDDING" && 
        gameState.currentPlayer === currentPlayerId && 
        dealingComplete && 
        biddingReady &&
        !cardsRevealed &&
        !showBlindNilModal &&
        !isBlindNil) {
      // For regular games, reveal cards immediately when it's your turn
      setCardsRevealed(true);
    }
  }, [gameState.status, gameState.currentPlayer, currentPlayerId, dealingComplete, biddingReady, cardsRevealed, showBlindNilModal, isBlindNil, myPlayerIndex]);
  
  // Track all game state changes that would affect the UI
  useEffect(() => {
    if (lastCurrentPlayer !== gameState.currentPlayer) {
      console.log(`Current player changed: ${lastCurrentPlayer} -> ${gameState.currentPlayer} (my ID: ${currentPlayerId})`);
      setLastCurrentPlayer(gameState.currentPlayer);
      
      // Force a component state update to trigger re-renders of children
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('gameStateChanged'));
      }
    }
  }, [gameState.currentPlayer, lastCurrentPlayer, currentPlayerId]);

  // Use the explicit position property if available, otherwise fall back to array index
  // @ts-ignore - position property might not be on the type yet
  const currentPlayerPosition = currentPlayer?.position !== undefined ? currentPlayer.position : sanitizedPlayers.findIndex((p: Player | null) => p && p.id === currentPlayerId);

  // FIXED ROTATION: Always put current player at bottom (South)
  const rotatePlayersForCurrentView = () => {
    // Find the current player's position
    const currentPlayerPosition = currentPlayer?.position ?? 0;
    
    // Create a rotated array where current player is at position 0 (South)
    const rotatedPlayers = sanitizedPlayers.map((player) => {
      if (!player) return null;
      // Calculate new position: (4 + originalPos - currentPlayerPosition) % 4
      // This ensures current player is at 0, and others are rotated accordingly
      const newPosition = (4 + (player.position ?? 0) - currentPlayerPosition) % 4;
      return { ...player, displayPosition: newPosition } as (Player | Bot) & { displayPosition: number };
    });
    
    // Create final array with players in their display positions
    const positions = Array(4).fill(null);
    rotatedPlayers.forEach((player) => {
      if (player && player.displayPosition !== undefined) {
        positions[player.displayPosition] = player;
      }
    });
    
    return positions;
  };

  // Preserve original positions in the array so the server knows where everyone sits
  const orderedPlayers = rotatePlayersForCurrentView();

  // Keep the getScaleFactor function
  const getScaleFactor = () => {
    // Don't scale on mobile
    if (windowSize.width < 640) return 1;
    
    // Base scale on the screen width compared to a reference size
    const referenceWidth = 1200; // Reference width for desktop
    let scale = Math.min(1, windowSize.width / referenceWidth);
    
    // Minimum scale to ensure things aren't too small
    return Math.max(0.6, scale);
  };
  
  // Calculate scaleFactor once based on window size
  const scaleFactor = getScaleFactor();
  
  // Update isMobile based on windowSize
  useEffect(() => {
    setIsMobile(windowSize.isMobile);
  }, [windowSize.isMobile]);

  // Modified handleBid to play sound
  const handleBid = (bid: number) => {
    if (!currentPlayerId || !currentPlayer) {
      console.error('Cannot bid: No current player or player ID');
      return;
    }
    
    // Validate that it's actually this player's turn
    if (gameState.currentPlayer !== currentPlayerId) {
      console.error(`Cannot bid: Not your turn. Current player is ${gameState.currentPlayer}`);
      return;
    }
    
    // Validate game state
    if (gameState.status !== 'BIDDING') {
      console.error(`Cannot bid: Game is not in bidding state (${gameState.status})`);
      return;
    }
    
    playBidSound();
    const payload = { gameId: gameState.id, userId: currentPlayerId, bid };
    console.log('[BID DEBUG] About to emit make_bid:', payload, 'Socket connected:', socket?.connected);
    socket?.emit("make_bid", payload);
    console.log('[BID DEBUG] make_bid emitted:', payload);
    console.log('Game status:', gameState.status, 'Current player:', gameState.currentPlayer);
    console.log('Socket connected:', socket?.connected);
    
    // Reveal cards after bidding if not blind nil
    if (!isBlindNil) {
      setCardsRevealed(true);
    }
  };

  const handleBlindNil = () => {
    console.log('[BLIND NIL] User chose blind nil');
    setIsBlindNil(true);
    setShowBlindNilModal(false);
    setBlindNilDismissed(true);
    // Blind nil is always bid 0 - no need to reveal cards or show bidding interface
    handleBid(0);
  };

  const handleRegularBid = () => {
    console.log('[BLIND NIL] User chose regular bid');
    setShowBlindNilModal(false);
    setBlindNilDismissed(true);
    setCardsRevealed(true);
    // Cards are now revealed and regular bidding interface will show
  };

  // Add at the top of the GameTable component, after useState declarations
  const [invitingBotSeat, setInvitingBotSeat] = useState<number | null>(null);
  const [pendingSystemMessage, setPendingSystemMessage] = useState<string | null>(null);
  const prevBidsRef = useRef<(number|null)[] | null>(null);
  const [pendingPlayedCard, setPendingPlayedCard] = useState<Card | null>(null);
  const [lastNonEmptyTrick, setLastNonEmptyTrick] = useState<Card[]>([]);

  const handleInviteBot = async (seatIndex: number) => {
    setInvitingBotSeat(seatIndex);
    try {
      const endpoint = gameState.status === 'WAITING'
        ? `/api/games/${gameState.id}/invite-bot`
        : `/api/games/${gameState.id}/invite-bot-midgame`;
      
      console.log('Inviting bot to seat:', seatIndex);
      const res = await api.post(endpoint, { seatIndex, requesterId: currentPlayerId });
      
      if (!res.ok) {
        const error = await res.json();
        console.error('Failed to invite bot:', error);
        alert('Failed to invite bot: ' + (error.error || 'Unknown error'));
      } else {
        const updatedGame = await res.json();
        console.log('Bot invited successfully:', updatedGame);
        setGameState(updatedGame);
        if (typeof setPendingSystemMessage === 'function') {
          setPendingSystemMessage(`A bot was invited to seat ${seatIndex + 1}.`);
        }
      }
    } catch (err) {
      console.error('Error inviting bot:', err);
      alert('Failed to invite bot');
    } finally {
      setInvitingBotSeat(null);
    }
  };

  // Add remove bot handler
  const handleRemoveBot = async (seatIndex: number) => {
    try {
      const endpoint = gameState.status === 'WAITING'
        ? `/api/games/${gameState.id}/remove-bot`
        : `/api/games/${gameState.id}/remove-bot-midgame`;
      const res = await api.post(endpoint, { seatIndex, requesterId: currentPlayerId });
      if (!res.ok) {
        const error = await res.json();
        alert('Failed to remove bot: ' + (error.error || 'Unknown error'));
      } else {
        // Update the local game state with the new data from the server
        const updatedGame = await res.json();
        setGameState(updatedGame);
        setPendingSystemMessage(`A bot was removed from seat ${seatIndex + 1}.`);
      }
    } catch (err) {
      alert('Failed to remove bot');
    }
  };

  // Update the player tricks display
  const renderPlayerPosition = (position: number) => {
    const player = orderedPlayers[position];
    // Define getPositionClasses FIRST
    const getPositionClasses = (pos: number): string => {
      // Base positioning
      const basePositions = [
        'bottom-4 left-1/2 -translate-x-1/2',  // South (bottom)
        'left-4 top-1/2 -translate-y-1/2',     // West (left)
        'top-4 left-1/2 -translate-x-1/2',     // North (top)
        'right-4 top-1/2 -translate-y-1/2'     // East (right)
      ];
      
      // Apply responsive adjustments
      if (windowSize.width < 768) {
        // Tighter positioning for smaller screens
        const mobilePositions = [
          'bottom-2 left-1/2 -translate-x-1/2',  // South
          'left-2 top-1/2 -translate-y-1/2',     // West
          'top-2 left-1/2 -translate-x-1/2',     // North
          'right-2 top-1/2 -translate-y-1/2'     // East
        ];
        return mobilePositions[pos];
      }
      
      return basePositions[pos];
    };

    console.log('Rendering player position', position, player);
    // If observer and seat is empty, show join button
    if (isObserver && !player) {
      return (
        <div className={`absolute ${getPositionClasses(position)} z-10`}>
          <button
            className="w-16 h-16 rounded-full bg-slate-600 border border-slate-300 text-slate-200 text-base flex items-center justify-center hover:bg-slate-500 transition"
            onClick={() => joinGame(gameState.id, user.id, { seat: position, username: user.username, avatar: user.avatar })}
          >
            JOIN
          </button>
        </div>
      );
    }
    // If seat is empty and user can invite a bot, show Invite Bot button
    if (!player && currentPlayerId && canInviteBot({
      gameState,
      currentPlayerId,
      seatIndex: position,
      isPreGame: gameState.status === 'WAITING',
      sanitizedPlayers: sanitizedPlayers.filter((p): p is Player | null => isPlayer(p) || p === null),
    })) {
      return (
        <div className={`absolute ${getPositionClasses(position)} z-10`}>
          <button
            className="w-16 h-16 rounded-full bg-gray-600 border border-slate-300 text-white flex flex-col items-center justify-center hover:bg-gray-500 transition disabled:opacity-50 p-0 py-1"
            onClick={() => handleInviteBot(position)}
            disabled={invitingBotSeat === position}
            style={{ fontSize: '10px', lineHeight: 1.1 }}
          >
            <span className="text-[10px] leading-tight mb-0">Invite</span>
            <span className="flex items-center justify-center my-0">
              <span className="text-lg font-bold mr-0.5">+</span>
              <FaRobot className="w-4 h-4" />
            </span>
            <span className="text-[10px] leading-tight mt-0">{invitingBotSeat === position ? '...' : 'Bot'}</span>
          </button>
        </div>
      );
    }
    // If seat is empty and user cannot invite a bot, show nothing
    if (!player) return null;

    // Shared variables for both bots and humans
    const isActive = gameState.status !== "WAITING" && gameState.currentPlayer === player.id;
    const isSideSeat = position === 1 || position === 3;
    const avatarWidth = isMobile ? 32 : 40;
    const avatarHeight = isMobile ? 32 : 40;
    
    // Determine game mode early for color selection
    const isPartnerGame = ((gameState as any).gameMode || (gameState as any).rules?.gameType) === 'PARTNERS';
    const isSoloGame = ((gameState as any).gameMode || (gameState as any).rules?.gameType) === 'SOLO';
    
    // Determine player color based on game mode
    let playerGradient;
    if (isSoloGame) {
      // Solo mode: 4 individual colors
      const soloColors = [
        "bg-gradient-to-r from-red-700 to-red-500",    // Position 0: Red
        "bg-gradient-to-r from-blue-700 to-blue-500",  // Position 1: Blue
        "bg-gradient-to-r from-orange-600 to-orange-400", // Position 2: Orange
        "bg-gradient-to-r from-purple-700 to-purple-500"  // Position 3: Purple
      ];
      playerGradient = soloColors[position];
    } else {
      // Partners mode: 2 team colors
    const redTeamGradient = "bg-gradient-to-r from-red-700 to-red-500";
    const blueTeamGradient = "bg-gradient-to-r from-blue-700 to-blue-500";
      playerGradient = (position === 0 || position === 2)
      ? blueTeamGradient
      : redTeamGradient;
    }
    // Calculate bid/made/tick/cross logic for both bots and humans
    const madeCount = player.tricks || 0;
    const bidCount = (gameState as any).bidding?.bids?.[position] ?? 0;
    let madeStatus = null;
    const tricksLeft = gameState.status === 'PLAYING' ? 13 - ((gameState as any).play?.tricks?.length || 0) : 13;
    
    if (isPartnerGame) {
      // Partner game logic
      const partnerIndex = (position + 2) % 4;
      const partner = orderedPlayers[partnerIndex];
      const partnerBid = (gameState as any).bidding?.bids?.[partnerIndex] ?? 0;
      const partnerMade = partner && partner.tricks ? partner.tricks : 0;
      
      // Calculate team totals
      const teamBid = bidCount + partnerBid;
      const teamMade = madeCount + partnerMade;
      
      // Nil bid: show cross if they take a trick, tick if they make it through
      if (bidCount === 0) {
        if (madeCount > 0) {
          madeStatus = '❌'; // Failed nil
        } else if (tricksLeft === 0) {
          madeStatus = '✅'; // Successful nil (hand complete)
        } else {
          madeStatus = null; // Still in progress
        }
      } else {
        // Non-nil: tick if teamMade >= teamBid, cross if teamMade < teamBid
        if (teamBid > 0) {
          if (teamMade >= teamBid) {
            madeStatus = '✅'; // Team made their bid
          } else if (teamMade + tricksLeft < teamBid) {
            madeStatus = '❌'; // Team cannot make their bid
          } else {
            madeStatus = null; // Still possible to make bid
          }
        } else {
          madeStatus = null; // No bid
        }
      }
    } else if (isSoloGame) {
      // Solo game logic (individual player)
      if (bidCount === 0) {
        // Nil bid
        if (madeCount > 0) {
          madeStatus = '❌'; // Failed nil
        } else if (tricksLeft === 0) {
          madeStatus = '✅'; // Successful nil
        } else {
          madeStatus = null; // Still in progress
        }
      } else if (bidCount > 0) {
        // Regular bid
        if (madeCount >= bidCount) {
          madeStatus = '✅'; // Made bid
        } else if (madeCount + tricksLeft < bidCount) {
          madeStatus = '❌'; // Cannot make bid
        } else {
          madeStatus = null; // Still possible
        }
      } else {
        madeStatus = null; // No bid
      }
    } else {
      // Fallback: hide
      madeStatus = null;
    }
    
    // Debug logging for tick/cross logic
    if (gameState.status === 'PLAYING' && (bidCount > 0 || madeCount > 0)) {
      if (isPartnerGame) {
        const partnerIndex = (position + 2) % 4;
        const partner = orderedPlayers[partnerIndex];
        const partnerBid = (gameState as any).bidding?.bids?.[partnerIndex] ?? 0;
        const partnerMade = partner && partner.tricks ? partner.tricks : 0;
        const teamBid = bidCount + partnerBid;
        const teamMade = madeCount + partnerMade;
        console.log(`[TICK/CROSS DEBUG] Player ${position} (${player?.username}): bid=${bidCount}, made=${madeCount}, partnerBid=${partnerBid}, partnerMade=${partnerMade}, teamBid=${teamBid}, teamMade=${teamMade}, tricksLeft=${tricksLeft}, status=${madeStatus}, canMakeBid=${teamMade + tricksLeft >= teamBid}`);
      } else {
        console.log(`[TICK/CROSS DEBUG] Player ${position} (${player?.username}): bid=${bidCount}, made=${madeCount}, tricksLeft=${tricksLeft}, status=${madeStatus}, isPartnerGame=${isPartnerGame}`);
      }
    }
    // --- END NEW LOGIC ---

    // Permission to remove bot: host (pre-game) or partner (mid-game)
    const canRemoveBot = (() => {
      if (!currentPlayerId) return false;
      if (gameState.status === 'WAITING') {
        // Host (seat 0) can always remove bots pre-game
        return sanitizedPlayers[0]?.id === currentPlayerId;
      } else {
        // Mid-game: partner (seat (position+2)%4) can remove bots
        const partnerIndex = (position + 2) % 4;
        return sanitizedPlayers[partnerIndex]?.id === currentPlayerId;
      }
    })();
    // After rendering the player avatar/info, render the played card if any
    // const playedCard = player ? getPlayedCardForPlayer(player.id) : null;
    const isHuman = player?.type === 'human';
    const displayName = isHuman ? player.username : 'Bot';
    const displayAvatar = isHuman ? player.avatar : '/bot-avatar.jpg';
    return (
      <div className={`absolute ${getPositionClasses(position)} z-30`}>
        <div className={`
          backdrop-blur-sm bg-white/10 rounded-xl overflow-hidden
          ${isActive ? 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/30' : 'shadow-md'}
          transition-all duration-200
        `}>
          <div className={isSideSeat ? "flex flex-col items-center p-1.5 gap-1.5" : "flex items-center p-1.5 gap-1.5"}>
            <div className="relative">
              <div className="rounded-full overflow-hidden p-0.5 bg-gradient-to-r from-gray-400 to-gray-600">
                <div className="bg-gray-900 rounded-full p-0.5">
                  <img
                    src={displayAvatar}
                    alt={displayName}
                    width={avatarWidth}
                    height={avatarHeight}
                    className="rounded-full object-cover"
                  />
                  {canRemoveBot && (
                    <button
                      className="absolute -bottom-1 -left-1 w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center text-xs border-2 border-white shadow hover:bg-red-700 transition z-50"
                      title="Remove Bot"
                      onClick={() => handleRemoveBot(position)}
                      style={{ zIndex: 50 }}
                    >
                      <FaMinus className="w-2.5 h-2.5" />
                    </button>
                  )}
                  {/* Dealer chip for bots */}
                  {player.isDealer && (
                    <>
                      {(() => { console.log('Rendering dealer chip for', player.username, player.isDealer); return null; })()}
                      <div className="absolute -bottom-1 -right-1">
                        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-r from-yellow-300 to-yellow-500 shadow-md">
                          <div className="w-4 h-4 rounded-full bg-yellow-600 flex items-center justify-center">
                            <span className="text-[8px] font-bold text-yellow-200">D</span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className={`w-full px-2 py-1 rounded-lg shadow-sm ${playerGradient}`} style={{ width: isMobile ? '50px' : '70px' }}>
                <div className="text-white font-medium truncate text-center" style={{ fontSize: isMobile ? '9px' : '11px' }}>
                  {displayName}
                </div>
              </div>
              {/* Bid/Trick counter for bots, same as humans */}
              <div className="backdrop-blur-md bg-white/20 rounded-full px-2 py-0.5 shadow-inner flex items-center justify-center gap-1"
                   style={{ width: isMobile ? '50px' : '70px' }}>
                <span style={{ fontSize: isMobile ? '9px' : '11px', fontWeight: 600 }}>
                  {gameState.status === "WAITING" ? "0" : madeCount}
                </span>
                <span className="text-white/70" style={{ fontSize: isMobile ? '9px' : '11px' }}>/</span>
                <span className="text-white font-semibold" style={{ fontSize: isMobile ? '9px' : '11px' }}>
                  {gameState.status === "WAITING" ? "0" : bidCount}
                </span>
                <span style={{ fontSize: isMobile ? '10px' : '12px' }} className="ml-1">
                  {madeStatus}
                </span>
              </div>
            </div>
            {/* playedCard && (
              <div className="flex justify-center mt-2">
                <img
                  src={`/cards/${getCardImage(playedCard)}`}
                  alt={`${playedCard.rank} of ${playedCard.suit}`}
                  style={{ width: 60, height: 90, objectFit: 'contain', borderRadius: 8, boxShadow: '0 2px 8px #0004' }}
                />
              </div>
            ) */}
          </div>
        </div>
      </div>
    );
  };

  // --- Card dealing animation state ---
  const [handImagesLoaded, setHandImagesLoaded] = useState(false);
  const [dealtCardCount, setDealtCardCount] = useState(0);
  const handImageRefs = useRef<{ [key: string]: boolean }>({});
  const dealTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Preload card images when hand changes
  useEffect(() => {
    if (!currentPlayer || !currentPlayer.hand) {
      setHandImagesLoaded(false);
      setDealtCardCount(0);
      handImageRefs.current = {};
      return;
    }
    const sortedHand = sortCards(currentPlayer.hand);
    let loadedCount = 0;
    handImageRefs.current = {};
    setHandImagesLoaded(false);
    setDealtCardCount(0);
    sortedHand.forEach((card) => {
      const img = new window.Image();
      img.src = `/cards/${getCardImage(card)}`;
      img.onload = () => {
        handImageRefs.current[`${card.suit}${card.rank}`] = true;
        loadedCount++;
        if (loadedCount === sortedHand.length) {
          setHandImagesLoaded(true);
        }
      };
      img.onerror = () => {
        handImageRefs.current[`${card.suit}${card.rank}`] = false;
        loadedCount++;
        if (loadedCount === sortedHand.length) {
          setHandImagesLoaded(true);
        }
      };
    });
    // Cleanup on hand change
    return () => {
      if (dealTimeoutRef.current) clearTimeout(dealTimeoutRef.current);
    };
  }, [currentPlayer && currentPlayer.hand && currentPlayer.hand.map(c => `${c.suit}${c.rank}`).join(",")]);

  // Animate dealing cards after images are loaded
  useEffect(() => {
    if (!handImagesLoaded || !currentPlayer || !currentPlayer.hand || gameState.status !== 'BIDDING') return;
    setDealtCardCount(0);
    setDealingComplete(false);
    const sortedHand = sortCards(currentPlayer.hand);
    
    function dealNext(idx: number) {
      setDealtCardCount(idx + 1);
      playCardSound();
      
      if (idx + 1 < sortedHand.length) {
        dealTimeoutRef.current = setTimeout(() => dealNext(idx + 1), 100);
      } else {
        // Dealing animation complete - allow bidding immediately
        setDealingComplete(true);
      }
    }
    dealTimeoutRef.current = setTimeout(() => dealNext(0), 10);
    return () => {
      if (dealTimeoutRef.current) clearTimeout(dealTimeoutRef.current);
    };
  }, [handImagesLoaded, gameState.status, currentPlayer?.id]);

  // When the game status changes to PLAYING, show all cards immediately
  useEffect(() => {
    if (gameState.status === 'PLAYING') {
      setDealtCardCount(myHand.length);
      setDealingComplete(true); // Allow immediate play in PLAYING phase
    }
  }, [gameState.status, myHand.length]);

  // Fallback: If we're in BIDDING and have cards but dealing is not complete after 3 seconds, force completion
  useEffect(() => {
    if (gameState.status === 'BIDDING' && myHand && myHand.length > 0 && !dealingComplete) {
      const timeout = setTimeout(() => {
        console.log('[FALLBACK] Forcing dealing completion after timeout');
        setDealtCardCount(myHand.length);
        setDealingComplete(true);
      }, 3000);
      
      return () => clearTimeout(timeout);
    }
  }, [gameState.status, myHand, dealingComplete]);

  // Reset dealing complete when game status changes to BIDDING
  useEffect(() => {
    if (gameState.status === 'BIDDING') {
      setDealingComplete(false); // Reset for new hand
    }
  }, [gameState.status]);

  // After dealing animation completes, enable bidding immediately
  useEffect(() => {
    if (dealingComplete && gameState.status === 'BIDDING') {
      console.log('[DEBUG] Dealing complete. Enabling bidding immediately.');
      setBiddingReady(true);
    } else {
      setBiddingReady(false);
    }
  }, [dealingComplete, gameState.status]);

  useEffect(() => {
    if (
      gameState.status === 'BIDDING' &&
      dealingComplete &&
      biddingReady &&
      currentPlayer &&
      isBot(currentPlayer) &&
      gameState.currentPlayer === currentPlayer.id &&
      typeof (gameState as any).bidding?.bids?.[currentPlayer.position] === 'undefined'
    ) {
      console.log('[DEBUG] Bot bidding triggered:', {
        dealingComplete,
        biddingReady,
        currentPlayer,
        currentPlayerId: currentPlayer.id,
        bids: (gameState as any).bidding?.bids
      });
      // Add a random delay between 1 and 1.5 seconds
      const delay = 1000 + Math.random() * 500;
      const botBidTimeout = setTimeout(() => {
        console.log('[DEBUG] Bot is making a bid after delay:', { delay, botId: currentPlayer.id });
        // Choose a simple bot bid (random or always 4 for now)
        const botBid = 4; // TODO: Replace with smarter logic if needed
        playBidSound();
        const payload = { gameId: gameState.id, userId: currentPlayer.id, bid: botBid };
        socket?.emit("make_bid", payload);
      }, delay);
      return () => clearTimeout(botBidTimeout);
    }
  }, [gameState.status, dealingComplete, biddingReady, currentPlayer, gameState.currentPlayer, (gameState as any).bidding?.bids, socket]);

  // Play bid sound for any new bid (human or bot)
  useEffect(() => {
    const bids = (gameState as any)?.bidding?.bids;
    if (!Array.isArray(bids)) return;
    const prevBids = prevBidsRef.current;
    if (prevBids) {
      for (let i = 0; i < bids.length; i++) {
        if (prevBids[i] === null && typeof bids[i] === 'number') {
          playBidSound();
          break; // Only play once per update
        }
      }
    }
    prevBidsRef.current = bids.slice();
  }, [(gameState as any)?.bidding?.bids]);

  const renderPlayerHand = () => {
    console.log('[DEBUG] renderPlayerHand called', { myHand, handImagesLoaded, gameStateStatus: gameState.status });
    if (!myHand || myHand.length === 0) return null;
    const sortedHand = sortCards(myHand);
    const isLeadingTrick = currentTrick.length === 0;
    const playableCards = gameState.status === "PLAYING" && myHand ? getPlayableCards(gameState, myHand, isLeadingTrick, trickCompleted) : [];
    // --- FIX: If it's your turn and playableCards is empty, allow all cards ---
    const isMyTurn = gameState.status === "PLAYING" && gameState.currentPlayer === currentPlayerId;
    // Only log if these exist
    if (typeof playableCards !== 'undefined' && typeof myHand !== 'undefined') {
      console.log('[DEBUG] isMyTurn:', isMyTurn);
      console.log('[DEBUG] playableCards:', playableCards);
      console.log('[DEBUG] myHand:', myHand);
    }
    // Defensive: only use myHand and playableCards if defined
    let effectivePlayableCards: typeof myHand = [];
    if (isMyTurn && Array.isArray(myHand)) {
      const isLeading = currentTrick.length === 0 || (trickCompleted && currentTrick.length === 4);
      const spadesBroken = (gameState as any).play?.spadesBroken;
      if (isLeading && !spadesBroken && myHand.some(c => c.suit !== 'S')) {
        effectivePlayableCards = myHand.filter(c => c.suit !== 'S');
        if (effectivePlayableCards.length === 0) {
          effectivePlayableCards = myHand; // Only spades left
        }
      } else {
        effectivePlayableCards = getPlayableCards(gameState, myHand, isLeading, trickCompleted);
      }
    } else if (Array.isArray(playableCards)) {
      effectivePlayableCards = playableCards;
    }
    const cardUIWidth = Math.floor(isMobile ? 80 : 100 * scaleFactor);
    const cardUIHeight = Math.floor(isMobile ? 110 : 140 * scaleFactor);
    const overlapOffset = Math.floor(isMobile ? -48 : -40 * scaleFactor);

    // --- FIX: Always show all cards in PLAYING phase or when dealing is complete ---
    const showAllCards = gameState.status === 'PLAYING' || dealingComplete;
    const visibleCount = showAllCards ? sortedHand.length : dealtCardCount;

    console.log('[DEBUG] isMyTurn:', isMyTurn);
    console.log('[DEBUG] playableCards:', playableCards);
    console.log('[DEBUG] myHand:', myHand);

    return (
      <div
        className="absolute inset-x-0 flex justify-center"
        style={{
          bottom: '-40px',
          pointerEvents: 'none',
        }}
      >
        <div className="flex">
          {sortedHand.map((card: Card, index: number) => {
            const isPlayable = (gameState.status === "PLAYING" &&
              gameState.currentPlayer === currentPlayerId &&
              effectivePlayableCards.some((c: Card) => c.suit === card.suit && c.rank === card.rank)) ||
              (gameState.status === "BIDDING" && gameState.currentPlayer === currentPlayerId);
            const isVisible = index < visibleCount;
            
            // Debug card playability
            if (index === 0) {
              console.log('[CARD DEBUG] Card playability check:', {
                card: `${card.rank}${card.suit}`,
                gameStateStatus: gameState.status,
                currentPlayer: gameState.currentPlayer,
                currentPlayerId,
                isMyTurn: gameState.currentPlayer === currentPlayerId,
                effectivePlayableCards: effectivePlayableCards.map((c: Card) => `${c.rank}${c.suit}`),
                isPlayable,
                isLeading: currentTrick.length === 0,
                trickCompleted,
                currentTrickLength: currentTrick.length
              });
            }
            return (
              <div
                key={`${card.suit}${card.rank}`}
                className={`relative transition-opacity duration-300 ${isPlayable ? 'cursor-pointer hover:z-20 hover:-translate-y-5 hover:shadow-lg' : 'cursor-not-allowed'} ${!isPlayable && gameState.currentPlayer === currentPlayerId ? 'opacity-50 grayscale pointer-events-none' : ''}`}
                style={{
                  width: `${cardUIWidth}px`,
                  height: `${cardUIHeight}px`,
                  marginLeft: index > 0 ? `${overlapOffset}px` : '0',
                  zIndex: index,
                  pointerEvents: 'auto',
                  opacity: isVisible ? 1 : 0,
                }}
                onClick={() => isPlayable && gameState.status === "PLAYING" && handlePlayCard(card)}
              >
                <div className="relative">
                  <CardImage
                    card={card}
                    width={cardUIWidth}
                    height={cardUIHeight}
                    className={`rounded-lg shadow-md ${isPlayable ? 'hover:shadow-lg' : ''}`}
                    alt={`${card.rank}${card.suit}`}
                    faceDown={!cardsRevealed && gameState.status === "BIDDING"}
                  />
                  {!isPlayable && gameState.currentPlayer === currentPlayerId && (
                    <div className="absolute inset-0 bg-gray-600/40 rounded-lg" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Effect to handle hand completion
  useEffect(() => {
    if (!socket) return;

    // Listen for hand completion event
    const handleHandCompleted = (data?: any) => {
      console.log('[HAND COMPLETED] Client received hand completion event:', data);
      console.log('Hand summary data received:', JSON.stringify(data, null, 2));
      
      // Store the hand summary data from server
      if (data) {
        setHandSummaryData(data);
        console.log('Hand summary data stored in state');
      } else {
        console.log('No hand summary data received');
      }
      
      // Add delay to allow trick completion animation to finish before showing hand summary
      setTimeout(() => {
        setShowHandSummary(true);
      }, 3000); // 3 second delay to allow trick animation to complete
    };
    
    // Register event listener for hand completion
    if (socket && socket.connected) {
      console.log('[SOCKET] Registering hand_completed event listener (socket connected)');
      socket.on('hand_completed', (data) => {
        console.log('[CLIENT] hand_completed event received:', data);
        handleHandCompleted(data);
      });
    } else {
      console.log('[SOCKET] Cannot register hand_completed listener - socket not ready:', { socket: !!socket, connected: socket?.connected });
    }
    
    return () => {
      if (socket) {
        socket.off('hand_completed', handleHandCompleted);
      }
    };
  }, [socket, gameState.id]);

  // Fallback: Check if hand is complete but no event was received
  useEffect(() => {
    // Only run fallback if we haven't already shown hand summary and no hand summary data exists
    // AND all 13 tricks have been played (hand is actually complete)
    const totalTricksPlayed = gameState.players?.reduce((total, p) => total + (p?.tricks || 0), 0) || 0;
    
    if ((gameState.status === "PLAYING" || gameState.status === "HAND_COMPLETED") && 
        !showHandSummary && 
        !handSummaryData &&
        totalTricksPlayed === 13) {
      console.log('[FALLBACK] Game status is HAND_COMPLETED but no hand summary shown, triggering fallback');
      
      // Add a flag to prevent multiple fallback triggers
      if ((window as any).__fallbackTriggered) {
        console.log('[FALLBACK] Fallback already triggered, skipping');
        return;
      }
      (window as any).__fallbackTriggered = true;
      
      // Calculate scores manually from game state
      const team1Tricks = (gameState.players?.[0]?.tricks || 0) + (gameState.players?.[2]?.tricks || 0);
      const team2Tricks = (gameState.players?.[1]?.tricks || 0) + (gameState.players?.[3]?.tricks || 0);
      const team1Bid = (gameState.bidding?.bids?.[0] || 0) + (gameState.bidding?.bids?.[2] || 0);
      const team2Bid = (gameState.bidding?.bids?.[1] || 0) + (gameState.bidding?.bids?.[3] || 0);
      
      const team1Score = team1Tricks >= team1Bid ? team1Bid * 10 + (team1Tricks - team1Bid) : -team1Bid * 10;
      const team2Score = team2Tricks >= team2Bid ? team2Bid * 10 + (team2Tricks - team2Bid) : -team2Bid * 10;
      
      const fallbackData = {
        team1Score,
        team2Score,
        team1Bags: Math.max(0, team1Tricks - team1Bid),
        team2Bags: Math.max(0, team2Tricks - team2Bid),
        team1TotalScore: gameState.team1TotalScore || team1Score,
        team2TotalScore: gameState.team2TotalScore || team2Score,
        tricksPerPlayer: gameState.players?.map(p => p?.tricks || 0) || [0, 0, 0, 0]
      };
      
      console.log('[FALLBACK] Calculated fallback data:', fallbackData);
      
      // Store the hand summary data
      setHandSummaryData(fallbackData);
      
      // Add delay to allow trick completion animation to finish before showing hand summary
      setTimeout(() => {
        setShowHandSummary(true);
      }, 3000);
    }
  }, [gameState.status, sanitizedPlayers, showHandSummary, handSummaryData, gameState.players, gameState.bidding]);

  // Effect to handle new hand started
  useEffect(() => {
    if (!socket) return;

    const handleNewHandStarted = (data: any) => {
      console.log('[NEW HAND] New hand started event received:', data);
      setDealingComplete(true); // Cards are dealt immediately
      setBiddingReady(false); // Bidding not ready yet
      setDealtCardCount(13);
      setShowHandSummary(false); // Close hand summary modal
      setHandSummaryData(null); // Clear hand summary data
      
      // Clear the fallback flag when a new hand starts
      (window as any).__fallbackTriggered = false;
      
      // Reset blind nil state for new hand
      setCardsRevealed(false);
      setBlindNilDismissed(false);
      setIsBlindNil(false);
      setShowBlindNilModal(false);

      // Directly update the game state with the new hand data
      setGameState(prev => ({
        ...prev,
        hands: data.hands,
        dealerIndex: data.dealerIndex,
        bidding: {
          ...prev.bidding,
          currentBidderIndex: data.currentBidderIndex,
          bids: [null, null, null, null],
          nilBids: {},
          currentPlayer: data.hands && data.hands.length > 0 && prev.players && Array.isArray(prev.players) && prev.players[(data.dealerIndex + 1) % 4]
            ? prev.players[(data.dealerIndex + 1) % 4]!.id
            : prev.bidding?.currentPlayer
        },
        status: 'BIDDING',
        play: undefined, // Clear play state for new hand
      }));
    };

    const handleBiddingReady = (data: any) => {
      console.log('[BIDDING READY] Bidding phase ready:', data);
      setBiddingReady(true);
      setGameState(prev => ({
        ...prev,
        bidding: {
          ...prev.bidding,
          currentBidderIndex: data.currentBidderIndex,
          currentPlayer: data.currentPlayer || ''
        }
      }));
    };

    socket.on('new_hand_started', handleNewHandStarted);
    socket.on('bidding_ready', handleBiddingReady);

    return () => {
      socket.off('new_hand_started', handleNewHandStarted);
      socket.off('bidding_ready', handleBiddingReady);
    };
  }, [socket]);



  // Initialize the global variable
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.lastCompletedTrick = null;
    }
  }, []);

  // Calculate scores - use hand summary data if available, otherwise use game state
  const team1Score = gameState.team1TotalScore ?? 0;
  const team2Score = gameState.team2TotalScore ?? 0;
  // Bag counter should show only the last digit (modulo 10)
  const team1Bags = (gameState.team1Bags ?? 0) % 10;
  const team2Bags = (gameState.team2Bags ?? 0) % 10;

  // Update cardPlayers when game state changes
  useEffect(() => {
    if (gameState.cardPlayers) {
      // setCardPlayers(gameState.cardPlayers); // This line is removed
    }
  }, [gameState.cardPlayers]);

  // Effect to handle game completion
  useEffect(() => {
    if (!socket) return;

    const handleGameOver = (data: { team1Score: number; team2Score: number; winningTeam: 1 | 2 }) => {
      console.log('Game over event received:', data);
      setShowHandSummary(false);
      setHandSummaryData(null);
      if (data.winningTeam === 1) {
        setShowWinner(true);
      } else {
        setShowLoser(true);
      }
    };

    socket.on('game_over', handleGameOver);

    return () => {
      socket.off('game_over', handleGameOver);
    };
  }, [socket]);

  // Effect to handle game status changes
  useEffect(() => {
    if (gameState.status === "COMPLETED") {
      const winningTeam = gameState.winningTeam === "team1" ? 1 : 2;
      setShowHandSummary(false);
      setHandSummaryData(null);
      if (winningTeam === 1) {
        setShowWinner(true);
      } else {
        setShowLoser(true);
      }
    }
  }, [gameState.status, gameState.winningTeam]);

  const [showGameInfo, setShowGameInfo] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (infoRef.current && !infoRef.current.contains(event.target as Node)) {
        setShowGameInfo(false);
      }
    }
    if (showGameInfo) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showGameInfo]);

  // --- Trick card rendering on the table, not inside player info ---
  const renderTrickCards = () => {
    // Use animated trick cards during animation, otherwise use current trick
    let displayTrick = animatingTrick ? animatedTrickCards : ((gameState as any)?.play?.currentTrick || []);
    if (!displayTrick.length && lastNonEmptyTrick.length) {
      displayTrick = lastNonEmptyTrick;
    }
    if (!displayTrick.length) return null;

    // Table positions: 0 = South (you), 1 = West, 2 = North, 3 = East
    const positions: Record<number, string> = {
      0: 'absolute bottom-[20%] left-1/2 -translate-x-1/2',  // South
      1: 'absolute left-[20%] top-1/2 -translate-y-1/2',     // West
      2: 'absolute top-[20%] left-1/2 -translate-x-1/2',     // North
      3: 'absolute right-[20%] top-1/2 -translate-y-1/2'     // East
    };

    // Always build seat order by player.position
    const seatOrderedPlayers = [...gameState.players].sort((a, b) => (a && b ? a.position - b.position : 0));
    const myPlayerId = user?.id;
    const mySeatIndex = seatOrderedPlayers.findIndex(p => p && p.id === myPlayerId);
    const orderedPlayers = [0,1,2,3].map(i => seatOrderedPlayers[(mySeatIndex + i) % 4]);

    return displayTrick.map((card: Card, i: number) => {
      const seatIndex = (card as any).playerIndex;
      const displayPosition = orderedPlayers.findIndex(p => p && p.position === seatIndex);
      if (displayPosition === -1 || displayPosition === undefined) return null;
      
      // Check if this card is the winning card
      const isWinningCard = animatingTrick && trickWinner !== null && seatIndex === trickWinner;
      
      return (
        <div
          key={`${card.suit}-${card.rank}-${i}`}
          className={`${positions[displayPosition]} z-20 transition-all duration-500 ${animatingTrick ? 'opacity-80' : ''}`}
          style={{ pointerEvents: 'none' }}
        >
          <img
            src={`/cards/${getCardImage(card)}`}
            alt={`${card.rank} of ${card.suit}`}
            className={`transition-all duration-300 ${isWinningCard ? 'shadow-[0_0_20px_4px_gold] scale-110' : ''}`}
            style={{ 
              width: 70, 
              height: 100, 
              objectFit: 'contain', 
              borderRadius: 8, 
              boxShadow: isWinningCard ? '0 0 20px 4px gold' : '0 2px 8px #0004',
              zIndex: isWinningCard ? 30 : 20
            }}
          />
          {isWinningCard && (
            <div className="absolute -top-2 -right-2 bg-yellow-400 text-black rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold animate-pulse">
              ✓
            </div>
          )}
        </div>
      );
    });
  };

  // --- Lobby chat toggle state ---
  const [chatType, setChatType] = useState<'game' | 'lobby'>('game');
  const [lobbyMessages, setLobbyMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!socket) return;
    const handleLobbyMsg = (msg: ChatMessage) => {
      setLobbyMessages(prev => [...prev, msg]);
    };
    socket.on('lobby_chat_message', handleLobbyMsg);
    return () => {
      socket.off('lobby_chat_message', handleLobbyMsg);
    };
  }, [socket]);

  // Loosen the chatReady guard so Chat UI renders as soon as gameState.id and currentPlayerId are available
  const chatReady = gameState?.id && currentPlayerId;

  // Add a new effect to handle socket reconnection and message sending
  useEffect(() => {
    if (!socket || !isAuthenticated || !gameState?.id || !user?.username) return;

    // Only send the join system message once per session
    if (window.__sentJoinSystemMessage !== gameState.id) {
      const systemMessage = {
        id: `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId: 'system',
        userName: 'System',
        message: `${user.username} joined the game.`,
        timestamp: Date.now(),
        isGameMessage: true
      };
      socket.emit('chat_message', { gameId: gameState.id, message: systemMessage });
      window.__sentJoinSystemMessage = gameState.id;
    }
  }, [socket, isAuthenticated, gameState?.id, user?.username]);

  // Move sendSystemMessage definition inside GameTable, after useSocket and gameState
  const sendSystemMessage = (message: string) => {
    if (!socket || !isAuthenticated) {
      console.log('Socket not ready for system message:', { connected: socket?.connected, authenticated: isAuthenticated });
      return;
    }
    const systemMessage: ChatMessage = {
      id: `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: 'system',
      userName: 'System',
      message,
      timestamp: Date.now(),
      isGameMessage: true
    };
    console.log('Sending system message:', systemMessage);
    socket.emit('chat_message', { gameId: gameState.id, message: systemMessage });
  };

  // After: const [gameState, setGameState] = useState(game);
  useEffect(() => {
    console.log('[DEBUG] GameTable received new game prop:', game);
    setGameState(game);
  }, [game]);

  // --- Always show current user's hand ---
  // const myUserId = user?.id;
  // const myHand = Array.isArray(gameState?.hands) && myUserId ? gameState.hands[gameState.players.findIndex(p => p.id === myUserId)] : [];
  // Use myHand for rendering your cards, both in bidding and play phases.

  // --- Show cards on the table (current trick) with player info ---
  const currentTrick = (gameState as any)?.play?.currentTrick || [];
  const trickLeaderIndex = (gameState as any)?.play?.trickLeaderIndex ?? 0; // fallback to 0 if not set
  const trickPlayers = [];
  for (let i = 0; i < currentTrick.length; i++) {
    const playerIndex = (trickLeaderIndex + i) % (gameState?.players?.length || 4);
    trickPlayers.push(gameState.players[playerIndex]);
  }
  // When rendering the trick:
  // currentTrick.map((card, i) => {
  //   const player = trickPlayers[i];
  //   return <div key={i}>{card.rank}{card.suit} played by {player?.username || 'Unknown'}</div>;
  // })

  // Add this function to handle playing a card
  const handlePlayCard = (card: Card) => {
    if (!socket || !gameState?.id || !user?.id) return;
    console.log('[CLIENT] handlePlayCard called:', { card, gameId: gameState.id, userId: user.id, socketConnected: socket.connected });
    console.log('[CLIENT] Current game state:', { status: gameState.status, currentPlayer: gameState.currentPlayer, myTurn: gameState.currentPlayer === user.id });
    console.log('[CLIENT] Card being played:', `${card.rank}${card.suit}`);
    playCardSound();
    setPendingPlayedCard(card); // Optimistically show the card
    socket.emit('play_card', { gameId: gameState.id, userId: user.id, card });
    console.log('[CLIENT] play_card event emitted');
  };

  // In useEffect, clear pendingPlayedCard when the backend confirms the card is in the trick
  useEffect(() => {
    if (!pendingPlayedCard) return;
    const currentTrick = (gameState as any)?.play?.currentTrick || [];
    const myPlayerIndex = gameState.players.findIndex(p => p && p.id === user?.id);
    if (currentTrick.some((c: Card & { playerIndex: number }) => c.suit === pendingPlayedCard.suit && c.rank === pendingPlayedCard.rank && c.playerIndex === myPlayerIndex)) {
      setPendingPlayedCard(null);
    }
  }, [gameState, pendingPlayedCard, user]);

  // Return the JSX for the component
  const handleLeaveTable = () => {
    if (typeof onLeaveTable === 'function') {
      onLeaveTable();
    }
  };

  // Helper to count empty seats
  const emptySeats = (gameState.players || []).filter(p => !p).length;

  // Modified start game handler
  const handleStartGame = async () => {
    if (emptySeats > 0) {
      setShowStartWarning(true);
      return;
    }
    if (typeof startGame === 'function' && gameState?.id && user?.id) {
      await startGame(gameState.id, user.id);
    }
  };

  // Invite bots to all empty seats, then start game
  const handlePlayWithBots = async () => {
    const emptySeatIndexes = (gameState.players || []).map((p, i) => p ? null : i).filter(i => i !== null);
    for (const seatIndex of emptySeatIndexes) {
      await handleInviteBot(seatIndex);
    }
    setShowStartWarning(false);
    if (typeof startGame === 'function' && gameState?.id && user?.id) {
      await startGame(gameState.id, user.id);
    }
  };

  useEffect(() => {
    if (pendingSystemMessage && socket && isAuthenticated) {
      sendSystemMessage(pendingSystemMessage);
      setPendingSystemMessage(null);
    }
  }, [pendingSystemMessage, socket, isAuthenticated]);

  // Add new state for trick animation
  const trickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [trickWinner, setTrickWinner] = useState<number | null>(null);
  const [animatingTrick, setAnimatingTrick] = useState(false);
  const [animatedTrickCards, setAnimatedTrickCards] = useState<Card[]>([]);
  const [trickCompleted, setTrickCompleted] = useState(false);

  // Listen for trick_complete event and animate trick
  useEffect(() => {
    if (socket) {
      const handleTrickComplete = (data: any) => {
        console.log('Trick complete event received:', data);
        if (data.trick && typeof data.trick.winnerIndex === 'number') {
          // Store the trick cards for animation
          setAnimatedTrickCards(data.trick.cards || []);
          setTrickWinner(data.trick.winnerIndex);
          setAnimatingTrick(true);
          setTrickCompleted(true); // Mark that trick is completed
          
          // Store the completed trick for fallback display
          setLastNonEmptyTrick(data.trick.cards || []);
          
          // Wait 2 seconds before clearing trick animation
          if (trickTimeoutRef.current) clearTimeout(trickTimeoutRef.current);
          trickTimeoutRef.current = setTimeout(() => {
            setAnimatingTrick(false);
            setTrickWinner(null);
            setAnimatedTrickCards([]);
            setTrickCompleted(false); // Reset trick completed state
          }, 2000);
        }
      };
      socket.on("trick_complete", handleTrickComplete);
      
      // Listen for clear_trick event to immediately clear table cards
      const handleClearTrick = () => {
        console.log('[DEBUG] Received clear_trick event, clearing table cards immediately');
        setAnimatedTrickCards([]);
        setTrickWinner(null);
        setAnimatingTrick(false);
        setTrickCompleted(false); // Reset trick completed state
        setLastNonEmptyTrick([]); // Clear the last non-empty trick as well
        
        // Don't clear currentTrick here - let the server handle it after animation
        // This allows the animation to complete while keeping cards visible
      };
      socket.on("clear_trick", handleClearTrick);
      
      return () => {
        socket.off("trick_complete", handleTrickComplete);
        socket.off("clear_trick", handleClearTrick);
        if (trickTimeoutRef.current) clearTimeout(trickTimeoutRef.current);
      };
    }
  }, [socket]);

  // Play win.mp3 when trick winner is announced
  useEffect(() => {
    if (animatingTrick && trickWinner !== null) {
      console.log('[DEBUG] Playing win.mp3 for trick winner:', trickWinner);
      playWinSound();
    }
  }, [animatingTrick, trickWinner]);

  // Play win.mp3 when trick winner is announced
  // Add CSS for fade-out and highlight-winner (can be in a CSS/SCSS file or styled-components)
  /*
  .fade-out {
    opacity: 0.3;
    transition: opacity 0.7s;
  }
  .highlight-winner {
    box-shadow: 0 0 16px 4px gold;
    z-index: 2;
    transition: box-shadow 0.3s;
  }
  */

  // Add effect to close hand summary modal when gameState.status transitions to BIDDING
  useEffect(() => {
    if (gameState.status === 'BIDDING') {
      setShowHandSummary(false);
      setHandSummaryData(null);
    }
  }, [gameState.status]);

  // Fallback: Show hand summary when game status is HAND_COMPLETED but no hand summary is shown
  useEffect(() => {
    if (gameState.status === 'HAND_COMPLETED' && !showHandSummary && !handSummaryData) {
      console.log('[FALLBACK] Game status is HAND_COMPLETED but no hand summary shown, triggering fallback');
      
      // Calculate scores manually from game state
      const team1Tricks = (gameState.players?.[0]?.tricks || 0) + (gameState.players?.[2]?.tricks || 0);
      const team2Tricks = (gameState.players?.[1]?.tricks || 0) + (gameState.players?.[3]?.tricks || 0);
      const team1Bid = (gameState.bidding?.bids?.[0] || 0) + (gameState.bidding?.bids?.[2] || 0);
      const team2Bid = (gameState.bidding?.bids?.[1] || 0) + (gameState.bidding?.bids?.[3] || 0);
      
      const team1Score = team1Tricks >= team1Bid ? team1Bid * 10 + (team1Tricks - team1Bid) : -team1Bid * 10;
      const team2Score = team2Tricks >= team2Bid ? team2Bid * 10 + (team2Tricks - team2Bid) : -team2Bid * 10;
      
      const fallbackData = {
        team1Score,
        team2Score,
        team1Bags: Math.max(0, team1Tricks - team1Bid),
        team2Bags: Math.max(0, team2Tricks - team2Bid),
        team1TotalScore: gameState.team1TotalScore || team1Score,
        team2TotalScore: gameState.team2TotalScore || team2Score,
        tricksPerPlayer: gameState.players?.map(p => p?.tricks || 0) || [0, 0, 0, 0]
      };
      
      console.log('[FALLBACK] Calculated fallback data for HAND_COMPLETED:', fallbackData);
      
      // Store the hand summary data
      setHandSummaryData(fallbackData);
      
      // Show hand summary immediately
      setShowHandSummary(true);
    }
  }, [gameState.status, showHandSummary, handSummaryData, gameState.players, gameState.bidding, gameState.team1TotalScore, gameState.team2TotalScore]);



  useEffect(() => {
    if (!socket) return;
    const handleSocketError = (error: { message: string }) => {
      if (typeof error?.message === 'string' && error.message.includes('spades')) {
        setPendingPlayedCard(null);
        alert(error.message);
      }
    };
    socket.on('error', handleSocketError);
    return () => {
      socket.off('error', handleSocketError);
    };
  }, [socket]);

  // Preload all card images on component mount
  useEffect(() => {
    const preloadCardImages = async () => {
      // Define all possible card images
      const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
      const suits = ['S', 'H', 'D', 'C'];
      const cardFiles = [
        'blue_back.png',
        ...ranks.map(rank => suits.map(suit => `${rank}${suit}.png`)).flat()
      ];
      
      // Preload each image
      const preloadPromises = cardFiles.map(filename => {
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = `/cards/${filename}`;
        });
      });
      
      await Promise.all(preloadPromises);
      console.log(`[IMAGE PRELOAD] Preloaded ${cardFiles.length} card images`);
    };
    
    preloadCardImages();
  }, []);

  // Simple stateless card image component to prevent flickering
  const CardImage = ({ card, width, height, className, alt, faceDown = false }: {
    card: Card;
    width: number;
    height: number;
    className?: string;
    alt?: string;
    faceDown?: boolean;
  }) => {
    const imageSrc = faceDown ? '/cards/blue_back.png' : `/cards/${getCardImage(card)}`;
    return (
      <img
        src={imageSrc}
        alt={alt || (faceDown ? 'Card Back' : `${card.rank}${card.suit}`)}
        width={width}
        height={height}
        className={className}
        style={{ objectFit: 'cover' }}
        loading="eager"
      />
    );
  };

  return (
    <>
      <LandscapePrompt />
      <div className="fixed inset-0 overflow-hidden bg-gray-900">
        {/* Main content area - full height */}
        <div className="flex h-full overflow-hidden">
          {/* Game table area - add padding on top and bottom */}
          <div className="w-[70%] p-2 flex flex-col h-full overflow-hidden">
            {/* Game table with more space top and bottom */}
            <div className="relative mb-2 overflow-hidden" style={{ 
              background: 'radial-gradient(circle at center, #316785 0%, #1a3346 100%)',
              borderRadius: `${Math.floor(64 * scaleFactor)}px`,
              border: `${Math.floor(2 * scaleFactor)}px solid #855f31`,
              height: '100%'
            }}>
              {/* Trick cards overlay - covers the whole table area */}
              <div className="absolute inset-0 pointer-events-none z-20">
                {renderTrickCards()}
              </div>
              
              {/* Trick winner announcement */}
              {animatingTrick && trickWinner !== null && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
                  <div className="bg-yellow-400 text-black px-6 py-3 rounded-lg shadow-lg font-bold text-lg animate-pulse">
                    {(() => {
                      const winner = gameState.players[trickWinner];
                      return winner ? `${winner.username} wins the trick!` : 'Trick won!';
                    })()}
                  </div>
                </div>
              )}
              {/* Leave Table button - inside table in top left corner */}
              <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                <button
                  onClick={handleLeaveTable}
                  className="p-2 bg-gray-800/90 text-white rounded-full hover:bg-gray-700 transition shadow-lg"
                  style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}
                >
                  <IoExitOutline className="h-5 w-5" />
                </button>
                <div className="relative" ref={infoRef}>
                  <button
                    onClick={() => setShowGameInfo((v) => !v)}
                    className="p-2 bg-gray-800/90 text-white rounded-full hover:bg-gray-700 transition shadow-lg"
                    style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}
                  >
                    <IoInformationCircleOutline className="h-5 w-5" />
                  </button>

                  {showGameInfo && (
                    <div className="absolute left-0 mt-2 w-64 bg-gray-900/95 border border-gray-700 rounded-lg shadow-xl p-4 z-50 text-sm text-white">
                      <div className="font-bold mb-2 flex items-center gap-2">
                        <IoInformationCircleOutline className="inline-block h-4 w-4 text-blue-400" />
                        Table Details
                      </div>
                      {/* GameTile-style info header */}
                      <div className="flex items-center gap-2 text-sm mb-2">
                        {/* Game type brick */}
                        {(() => {
                          const type = (gameState as any).rules?.gameType || 'REGULAR';
                          let color = 'bg-green-600';
                          let label = 'REGULAR';
                          if (type === 'WHIZ') {
                            color = 'bg-blue-600';
                            label = 'WHIZ';
                          } else if (type === 'MIRROR') {
                            color = 'bg-red-600';
                            label = 'MIRRORS';
                          } else if ((gameState as any).forcedBid && (gameState as any).forcedBid !== 'NONE') {
                            color = 'bg-orange-500';
                                                          if ((gameState as any).forcedBid === 'BID4NIL') label = '4 OR NIL';
                            else if ((gameState as any).forcedBid === 'BID3') label = 'BID 3';
                            else if ((gameState as any).forcedBid === 'BIDHEARTS') label = 'BID HEARTS';
                            else if ((gameState as any).forcedBid === 'SUICIDE') label = 'SUICIDE';
                            else label = 'GIMMICK';
                          }
                          return <span className={`inline-block ${color} text-white font-bold text-xs px-2 py-0.5 rounded mr-2`}>{label}</span>;
                        })()}
                        {/* Points */}
                        <span className="text-slate-300 font-medium">{gameState.minPoints}/{gameState.maxPoints}</span>
                        {/* Nil and bn (blind nil) with inline check/cross */}
                        {gameState.rules?.allowNil && <span className="text-slate-300 ml-2">nil <span className="align-middle">☑️</span></span>}
                        {!gameState.rules?.allowNil && <span className="text-slate-300 ml-2">nil <span className="align-middle">❌</span></span>}
                        <span className="text-slate-300 ml-2">bn <span className="align-middle">{gameState.rules?.allowBlindNil ? '☑️' : '❌'}</span></span>
                      </div>
                      {/* Line 2: Buy-in, game mode, and special bricks */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-yellow-500 text-lg font-bold">{((gameState.buyIn ?? (gameState as any).rules?.coinAmount ?? 100000) / 1000).toFixed(0)}k</span>
                        <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
                        </svg>
                        <span className="ml-2 text-xs font-bold text-slate-200 uppercase">{gameState.gameMode || (gameState.rules?.gameType === 'SOLO' ? 'SOLO' : 'PARTNERS')}</span>
                        {/* Special bricks for assassin/screamer */}
                        {gameState.specialRules?.assassin && (
                          <span className="inline-block bg-red-600 text-white font-bold text-xs px-2 py-0.5 rounded ml-2">ASSASSIN</span>
                        )}
                        {gameState.specialRules?.screamer && (
                          <span className="inline-block bg-blue-600 text-white font-bold text-xs px-2 py-0.5 rounded ml-2">SCREAMER</span>
                        )}
                      </div>
                      {/* Prize info */}
                      <div className="mt-2 pt-2 border-t border-gray-700">
                        <div className="text-sm">
                          <span className="text-gray-400">Prize:</span>
                          <span className="font-bold text-yellow-400 ml-2">
                            {(() => {
                              const buyIn = (gameState as any).rules?.coinAmount || 100000;
                              const prizePot = buyIn * 4 * 0.9;
                              // Check gameMode for Partners vs Solo, not gameType
                              const isPartnersMode = gameState.gameMode === 'PARTNERS' || (gameState.rules?.gameType !== 'SOLO' && !gameState.gameMode);
                              if (isPartnersMode) {
                                return `${formatCoins(prizePot / 2)} each`;
                              } else {
                                // Solo mode: 2nd place gets their stake back, 1st place gets the remainder
                                const secondPlacePrize = buyIn; // Exactly their stake back
                                const firstPlacePrize = prizePot - secondPlacePrize; // Remainder after 2nd place gets their stake
                                return `1st: ${formatCoins(firstPlacePrize)}, 2nd: ${formatCoins(secondPlacePrize)}`;
                              }
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Scoreboard in top right corner - inside the table */}
              <div className="absolute top-4 right-4 z-10 flex flex-col items-center gap-2 px-3 py-2 bg-gray-800/90 rounded-lg shadow-lg">
                {gameState.gameMode === 'SOLO' ? (
                  // Solo mode - 4 individual players
                  <>
                    {[0, 1, 2, 3].map((playerIndex) => {
                      const playerScore = gameState.playerScores?.[playerIndex] || 0;
                      const playerBags = gameState.playerBags?.[playerIndex] || 0;
                      const playerColor = getPlayerColor(playerIndex);
                      const playerName = gameState.players[playerIndex]?.username || `Player ${playerIndex + 1}`;
                      
                      return (
                        <div key={playerIndex} className="flex items-center">
                          <div className={`${playerColor.bg} rounded-full w-2 h-2 mr-1`}></div>
                          <span className="text-white font-bold mr-1 text-sm">{playerScore}</span>
                          {/* Player Bags */}
                          <div className="flex items-center text-yellow-300 ml-2" title={`${playerName} Bags: ${playerBags}`}> 
                            <img src="/bag.svg" width={16} height={16} alt="Bags" className="mr-1" />
                            <span className="text-xs font-bold">{playerBags}</span>
                          </div>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  // Partners mode - 2 teams
                  <>
                    {/* Blue Team Score and Bags */}
                <div className="flex items-center">
                      <div className="bg-blue-500 rounded-full w-2 h-2 mr-1"></div>
                  <span className="text-white font-bold mr-1 text-sm">{team1Score}</span>
                      {/* Blue Team Bags */}
                      <div className="flex items-center text-yellow-300 ml-2" title={`Blue Team Bags: ${team1Bags}`}> 
                    <img src="/bag.svg" width={16} height={16} alt="Bags" className="mr-1" />
                    <span className="text-xs font-bold">{team1Bags}</span>
                  </div>
                </div>

                    {/* Red Team Score and Bags */}
                <div className="flex items-center">
                      <div className="bg-red-500 rounded-full w-2 h-2 mr-1"></div>
                  <span className="text-white font-bold mr-1 text-sm">{team2Score}</span>
                      {/* Red Team Bags */}
                      <div className="flex items-center text-yellow-300 ml-2" title={`Red Team Bags: ${team2Bags}`}> 
                    <img src="/bag.svg" width={16} height={16} alt="Bags" className="mr-1" />
                    <span className="text-xs font-bold">{team2Bags}</span>
                  </div>
                </div>
                  </>
                )}
              </div>
        
              {/* Players around the table */}
              {[0, 1, 2, 3].map((position) => (
                <div key={`player-position-${position}`}>
                  {renderPlayerPosition(position)}
                </div>
              ))}

              {/* Center content */}
              {/* Overlay the game status buttons/messages on top of the play area */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {gameState.status === "WAITING" && sanitizedPlayers.length === 4 && sanitizedPlayers[0]?.id === currentPlayerId ? (
                  <button
                    onClick={handleStartGame}
                    className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg shadow-lg transform hover:scale-105 transition-all pointer-events-auto"
                    style={{ fontSize: `${Math.floor(16 * scaleFactor)}px` }}
                  >
                    Start Game
                  </button>
                ) : gameState.status === "WAITING" && sanitizedPlayers.length < 4 ? (
                  <div className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-center pointer-events-auto"
                       style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}>
                    <div className="font-bold">Waiting for Players</div>
                    <div className="text-sm mt-1">{sanitizedPlayers.length}/4 joined</div>
                  </div>
                ) : gameState.status === "WAITING" && sanitizedPlayers[0]?.id !== currentPlayerId ? (
                  <div className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-center pointer-events-auto"
                       style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}>
                    <div className="font-bold">Waiting for Host</div>
                    <div className="text-sm mt-1">Only {isPlayer(sanitizedPlayers[0]) ? sanitizedPlayers[0].name : isBot(sanitizedPlayers[0]) ? sanitizedPlayers[0].username : 'Unknown'} can start</div>
                  </div>
                ) : (() => {
                  console.log('[BIDDING DEBUG] Checking bidding conditions:', {
                    gameStateStatus: gameState.status,
                    currentPlayerId,
                    gameStateCurrentPlayer: gameState.currentPlayer,
                    dealingComplete,
                    biddingReady,
                    isBiddingPhase: gameState.status === "BIDDING",
                    isMyTurn: gameState.currentPlayer === currentPlayerId,
                    isSpectator: myPlayerIndex === -1,
                    shouldShowBiddingInterface: gameState.status === "BIDDING" && gameState.currentPlayer === currentPlayerId && dealingComplete && biddingReady && myPlayerIndex !== -1
                  });
                  return null;
                })() || gameState.status === "BIDDING" && gameState.currentPlayer === currentPlayerId && dealingComplete && biddingReady && myPlayerIndex !== -1 ? (
                  <div className="flex items-center justify-center w-full h-full pointer-events-auto">
                    {(() => {
                      // Determine game type, including all gimmick games
                      let gameType = (gameState as any).rules.gameType;
                      const forcedBid = (gameState as any).forcedBid;
                      if (forcedBid === 'SUICIDE') {
                        gameType = 'SUICIDE';
                      } else if (forcedBid === 'BID4NIL') {
                        gameType = '4 OR NIL';
                      } else if (forcedBid === 'BID3') {
                        gameType = 'BID 3';
                      } else if (forcedBid === 'BIDHEARTS') {
                        gameType = 'BID HEARTS';
                      }
  
  console.log('[GAMETABLE DEBUG] Game state analysis:', {
    gameMode: gameState.gameMode,
    rulesGameType: (gameState as any).rules?.gameType,
    forcedBid: (gameState as any).forcedBid,
    specialRules: gameState.specialRules,
    finalGameType: gameType
  });
                      console.log('[GAMETABLE DEBUG] BiddingInterface props:', {
                        gameType,
                        gameStateRules: (gameState as any).rules,
                        currentPlayerId,
                        gameStateCurrentPlayer: gameState.currentPlayer,
                        numSpades: currentPlayer ? countSpades(currentPlayer.hand) : 0,
                        gameStateStatus: gameState.status,
                        dealingComplete,
                        biddingReady
                      });
                      // Get the current player's hand from gameState.hands array
                      const currentPlayerIndex = sanitizedPlayers.findIndex(p => p && p.id === currentPlayerId);
                      const currentPlayerHand = (gameState as any).hands && (gameState as any).hands[currentPlayerIndex];
                      
                      // Debug logging to see what's in the hand
                      console.log('[WHIZ DEBUG] Hand data:', {
                        currentPlayerIndex,
                        currentPlayerHand,
                        handLength: currentPlayerHand?.length,
                        spadesInHand: currentPlayerHand?.filter((card: any) => card.suit === '♠'),
                        allCards: currentPlayerHand?.map((card: any) => `${card.suit}${card.rank}`)
                      });
                      
                      // Calculate if player has Ace of Spades for Whiz games
                      const hasAceSpades = currentPlayerHand?.some((card: any) => (card.suit === '♠' || card.suit === 'S') && card.rank === 'A') || false;
                      
                      // Calculate number of hearts for BID HEARTS games
                      const countHearts = (hand: Card[] | undefined): number => {
                        if (!hand || !Array.isArray(hand)) return 0;
                        return hand.filter(card => card.suit === '♥' || (card as any).suit === 'H').length;
                      };
                      const numHearts = currentPlayerHand ? countHearts(currentPlayerHand) : 0;
                      
                      // Get partner bid for Suicide games
                      let partnerBid: number | undefined;
                      if ((gameState as any).forcedBid === 'SUICIDE' && (gameState as any).bidding && (gameState as any).bidding.bids) {
                        const partnerIndex = (currentPlayerIndex + 2) % 4;
                        partnerBid = (gameState as any).bidding.bids[partnerIndex];
                      }
                      
                                              return (
                          <>
                            {/* Blind Nil Modal */}
                            <BlindNilModal
                              isOpen={showBlindNilModal}
                              onBlindNil={handleBlindNil}
                              onRegularBid={handleRegularBid}
                            />
                            
                            {/* Bidding Interface */}
                            {!showBlindNilModal && cardsRevealed && (
                              <BiddingInterface
                                onBid={handleBid}
                                currentBid={(gameState as any).bidding?.bids?.[0]}
                                gameType={gameType}
                                numSpades={currentPlayerHand ? countSpades(currentPlayerHand) : 0}
                                numHearts={numHearts}
                                playerId={currentPlayerId}
                                currentPlayerTurn={gameState.currentPlayer}
                                allowNil={gameState.rules.allowNil}
                                hasAceSpades={hasAceSpades}
                                forcedBid={(gameState as any).forcedBid}
                                partnerBid={partnerBid}
                              />
                            )}
                          </>
                        );
                    })()}
                  </div>
                ) : gameState.status === "BIDDING" && !dealingComplete ? (
                  <div className="px-4 py-2 bg-gray-700 text-white rounded-lg text-center animate-pulse pointer-events-auto"
                       style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}>
                    <div className="font-bold">Dealing Cards...</div>
                    <div className="text-sm mt-1">Please wait while cards are being dealt</div>
                  </div>
                ) : gameState.status === "BIDDING" && gameState.currentPlayer !== currentPlayerId && !animatingTrick ? (
                  <div className="px-4 py-2 bg-gray-700 text-white rounded-lg text-center animate-pulse pointer-events-auto"
                       style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}>
                    {gameState.currentPlayer
                      ? (() => {
                          // Robust debug logging for player ID mapping
                          console.log('[DEBUG] Waiting for player:', gameState.currentPlayer, 'All player IDs:', sanitizedPlayers.map(p => p && p.id));
                          // Try to find the player by ID
                          let waitingPlayer = sanitizedPlayers.find((p): p is Player | Bot => !!p && String(p.id) === String(gameState.currentPlayer)) || null;
                          // If not found, try to find by loose equality (in case of type mismatch)
                          if (!waitingPlayer) {
                            waitingPlayer = sanitizedPlayers.find((p): p is Player | Bot => !!p && p.id == gameState.currentPlayer) || null;
                          }
                          // If still not found, log a warning
                          if (!waitingPlayer) {
                            console.warn('[WARN] Could not resolve waiting player for currentPlayer:', gameState.currentPlayer, 'Players:', sanitizedPlayers);
                          }
                          const waitingName = isPlayer(waitingPlayer) ? waitingPlayer.name : isBot(waitingPlayer) ? waitingPlayer.username : gameState.currentPlayer ? `Player ${gameState.currentPlayer}` : "Unknown";
                      return (
                        <div className="font-bold">Waiting for {waitingName}</div>
                      );
                        })()
                      : (
                          <div className="font-bold">Waiting for next phase...</div>
                        )
                    }
                  </div>
                ) : gameState.status === "PLAYING" && currentTrick?.length === 0 && gameState.currentPlayer !== currentPlayerId && !animatingTrick ? (
                  <div className="px-4 py-2 bg-gray-700/70 text-white rounded-lg text-center pointer-events-auto"
                       style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}>
                    {gameState.currentPlayer
                      ? (() => {
                      const waitingPlayer = sanitizedPlayers.find((p): p is Player | Bot => !!p && p.id === gameState.currentPlayer) || null;
                      const waitingName = isPlayer(waitingPlayer) ? waitingPlayer.name : isBot(waitingPlayer) ? waitingPlayer.username : "Unknown";
                      return (
                        <div className="text-sm">Waiting for {waitingName} to play</div>
                      );
                        })()
                      : (
                          <div className="text-sm">Waiting for next phase...</div>
                        )
                    }
                  </div>
                ) : null}
              </div>
            </div>

            {/* Cards area with more space - only show for actual players, not spectators */}
            {myPlayerIndex !== -1 && (
              <div className="bg-gray-800/50 rounded-lg relative mb-0" 
                   style={{ 
                     height: `${Math.floor(110 * scaleFactor)}px`
                   }}>
                {renderPlayerHand()}
              </div>
            )}
          </div>

          {/* Chat area - 30%, full height */}
          <div className="w-[30%] h-full overflow-hidden">
            {chatReady ? (
              <Chat 
                gameId={gameState.id}
                userId={currentPlayerId || ''}
                userName={isPlayer(currentPlayer) ? currentPlayer.name : isBot(currentPlayer) ? currentPlayer.username : 'Unknown'}
                players={sanitizedPlayers.filter((p): p is Player => isPlayer(p))}
                userAvatar={isPlayer(currentPlayer) ? currentPlayer.avatar : undefined}
                chatType={chatType}
                onToggleChatType={() => setChatType(chatType === 'game' ? 'lobby' : 'game')}
                lobbyMessages={lobbyMessages}
                spectators={(gameState as any).spectators || []}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 text-lg">Connecting chat...</div>
            )}
          </div>
        </div>

        {/* Hand Summary Modal - Pass currentHandSummary */}
        {(() => {
          const shouldShow = showHandSummary && !isGameOver(gameState);
          console.log('[MODAL DEBUG] showHandSummary:', showHandSummary, 'isGameOver:', isGameOver(gameState), 'shouldShow:', shouldShow);
          return shouldShow ? (
          <HandSummaryModal
            isOpen={showHandSummary}
            onClose={() => setShowHandSummary(false)}
            gameState={gameState}
            handSummaryData={handSummaryData}
            onNextHand={handleStartNewHand}
            />
          ) : null;
        })()}

        {/* Winner/Loser Modals */}
        {(showWinner || showLoser) && (() => {
          if (gameState.gameMode === 'SOLO') {
            // Solo mode - use SoloWinnerModal for both winner and loser
            const myPlayerIndex = gameState.players.findIndex(p => p && p.id === user?.id);
            const winningPlayer = gameState.winningPlayer || 0;
            const playerScores = gameState.playerScores || [0, 0, 0, 0];
            
            return (
              <SoloWinnerModal
                isOpen={true}
                onClose={handleLeaveTable}
                playerScores={playerScores}
                winningPlayer={winningPlayer}
                onPlayAgain={handlePlayAgain}
                userPlayerIndex={myPlayerIndex}
          />
            );
          } else {
            // Partners mode - use existing Winner/Loser modals
            const myPlayerIndex = gameState.players.findIndex(p => p && p.id === user?.id);
            const userTeam = myPlayerIndex >= 0 ? (myPlayerIndex === 0 || myPlayerIndex === 2 ? 1 : 2) : 1;
            
            if (showWinner) {
              return (
          <WinnerModal
            isOpen={true}
            onClose={handleLeaveTable}
                  team1Score={gameState.team1TotalScore || 0}
                  team2Score={gameState.team2TotalScore || 0}
            winningTeam={1}
            onPlayAgain={handlePlayAgain}
                  userTeam={userTeam}
          />
              );
            } else if (showLoser) {
              return (
          <LoserModal
            isOpen={true}
            onClose={handleLeaveTable}
                  team1Score={gameState.team1TotalScore || 0}
                  team2Score={gameState.team2TotalScore || 0}
            winningTeam={2}
            onPlayAgain={handlePlayAgain}
                  userTeam={userTeam}
          />
              );
            }
          }
        })()}
        <StartGameWarningModal
          isOpen={showStartWarning}
          onClose={() => setShowStartWarning(false)}
          onPlayWithBots={handlePlayWithBots}
          emptySeatsCount={emptySeats}
        />
      </div>
    </>
  );
}