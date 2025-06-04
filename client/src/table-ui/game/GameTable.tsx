"use client";

import { useState, useEffect, useRef } from "react";
import type { GameState, Card, Suit, Player, CompletedTrick } from '../../types/game';
import { Socket } from "socket.io-client";
import Chat from './Chat';
import HandSummaryModal from './HandSummaryModal';
import WinnerModal from './WinnerModal';
import LoserModal from './LoserModal';
import BiddingInterface from './BiddingInterface';
import { calculateHandScore } from '../../lib/scoring';
import LandscapePrompt from '../../LandscapePrompt';
import { IoExitOutline, IoInformationCircleOutline } from "react-icons/io5";
import { useWindowSize } from '../../hooks/useWindowSize';
import { FaRobot } from 'react-icons/fa';
import { FaMinus } from 'react-icons/fa';

interface GameTableProps {
  game: GameState;
  socket: Socket | null;
  joinGame: (gameId: string, userId: string, options?: any) => void;
  onLeaveTable: () => void;
  startGame: (gameId: string, userId?: string) => Promise<void>;
  user?: any;
}

// Helper function to get card image filename
function getCardImage(card: Card): string {
  if (!card) return 'back.png';
  const suitMap: Record<Suit, string> = { '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C' };
  return `${card.rank}${suitMap[card.suit]}.png`;
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
  return [...cards].sort((a, b) => {
    const suitOrder: Record<Suit, number> = { '♣': 0, '♥': 1, '♦': 2, '♠': 3 };
    if (a.suit !== b.suit) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    return getCardValue(a.rank) - getCardValue(b.rank);
  });
}

// Add new helper functions after the existing ones
function getLeadSuit(trick: Card[]): Suit | null {
  return trick[0]?.suit || null;
}

function hasSpadeBeenPlayed(game: GameState): boolean {
  // Check if any completed trick contained a spade
  return game.completedTricks?.some((trick: any) =>
    Array.isArray(trick.cards) && trick.cards.some((card: Card) => card.suit === '♠')
  ) || false;
}

function canLeadSpades(game: GameState, hand: Card[]): boolean {
  // Can lead spades if:
  // 1. Spades have been broken, or
  // 2. Player only has spades left
  return hasSpadeBeenPlayed(game) || hand.every(card => card.suit === '♠');
}

function getPlayableCards(game: GameState, hand: Card[], isLeadingTrick: boolean): Card[] {
  if (!hand.length) return [];

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
  const leadSuit = getLeadSuit(game.currentTrick);
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
  }
}

// Helper function to count spades in a hand
const countSpades = (hand: Card[]): number => {
  return hand.filter(card => card.suit === '♠').length;
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

export default function GameTable({ 
  game, 
  socket, 
  joinGame, 
  onLeaveTable,
  startGame,
  user: propUser
}: GameTableProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [showHandSummary, setShowHandSummary] = useState(false);
  const [showWinner, setShowWinner] = useState(false);
  const [showLoser, setShowLoser] = useState(false);
  
  // Use the windowSize hook to get responsive information
  const windowSize = useWindowSize();
  
  // Add state to directly track which player played which card
  const [cardPlayers, setCardPlayers] = useState<{[key: string]: string}>({});
  
  const user = propUser;
  
  // Use gameState for all game data
  const [gameState, setGameState] = useState(game);
  
  // Use gameState instead of game
  const currentTrick = gameState.currentTrick || [];
  
  // Find the current player's ID
  const currentPlayerId = user?.id;
  
  // After getting the players array:
  const sanitizedPlayers = (gameState.players || []);
  const isObserver = !sanitizedPlayers.some((p: Player | null) => p && p.id === currentPlayerId);
  console.log('game.players:', gameState.players); // Debug log to catch nulls

  // Find the current player's position and team
  const currentPlayer = sanitizedPlayers.find((p: Player | null) => p && p.id === currentPlayerId) || null;
  
  // Add state to force component updates when the current player changes
  const [lastCurrentPlayer, setLastCurrentPlayer] = useState<string>(gameState.currentPlayer);
  
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
    const rotatedPlayers = sanitizedPlayers.map((player: Player | null) => {
      if (!player) return null;
      // Calculate new position: (4 + originalPos - currentPlayerPosition) % 4
      // This ensures current player is at 0, and others are rotated accordingly
      const newPosition = (4 + (player.position ?? 0) - currentPlayerPosition) % 4;
      return { ...player, displayPosition: newPosition } as Player & { displayPosition: number };
    });
    
    // Create final array with players in their display positions
    const positions = Array(4).fill(null);
    rotatedPlayers.forEach((player: (Player & { displayPosition: number }) | null) => {
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
    
    console.log(`Submitting bid: ${bid} for player ${currentPlayerId} in game ${gameState.id}`);
    socket?.emit("make_bid", { gameId: gameState.id, userId: currentPlayerId, bid });
    console.log('Game status:', gameState.status, 'Current player:', gameState.currentPlayer);
    console.log('Socket connected:', socket?.connected);
  };

  // Add at the top of the GameTable component, after useState declarations
  const [invitingBotSeat, setInvitingBotSeat] = useState<number | null>(null);

  const handleInviteBot = async (seatIndex: number) => {
    setInvitingBotSeat(seatIndex);
    try {
      const endpoint = gameState.status === 'WAITING'
        ? `/api/games/${gameState.id}/invite-bot`
        : `/api/games/${gameState.id}/invite-bot-midgame`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seatIndex, requesterId: currentPlayerId }),
      });
      if (!res.ok) {
        const error = await res.json();
        alert('Failed to invite bot: ' + (error.error || 'Unknown error'));
      } else {
        // Optionally, refresh game state or rely on socket update
      }
    } catch (err) {
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
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seatIndex, requesterId: currentPlayerId }),
      });
      if (!res.ok) {
        const error = await res.json();
        alert('Failed to remove bot: ' + (error.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Failed to remove bot');
    }
  };

  // Update the player tricks display
  const renderPlayerPosition = (position: number) => {
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

    const player = orderedPlayers[position];
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
      sanitizedPlayers,
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

    // If player is a bot, show bot avatar and label
    if (player.type === 'bot') {
      const isActive = gameState.status !== "WAITING" && gameState.currentPlayer === player.id;
      const isSideSeat = position === 1 || position === 3;
      const avatarWidth = isMobile ? 32 : 40;
      const avatarHeight = isMobile ? 32 : 40;
      // Team color: seats 0 and 2 are blue, 1 and 3 are red
      const teamGradient = (position === 0 || position === 2)
        ? "bg-gradient-to-r from-blue-700 to-blue-500"
        : "bg-gradient-to-r from-red-700 to-red-500";
      const madeCount = player.tricks || 0;
      const bidCount = player.bid !== undefined ? player.bid : 0;
      const madeStatus = madeCount >= bidCount 
        ? "✅"
        : "❌";
      // Permission to remove bot: host (pre-game) or partner (mid-game)
      const canRemoveBot = canInviteBot({
        gameState,
        currentPlayerId,
        seatIndex: position,
        isPreGame: gameState.status === 'WAITING',
        sanitizedPlayers,
      });
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
                      src={player.avatar || '/bot-avatar.jpg'}
                      alt="Bot"
                      width={avatarWidth}
                      height={avatarHeight}
                      className="rounded-full object-cover"
                    />
                    {canRemoveBot && (
                      <button
                        className="absolute -bottom-1 -right-1 w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center text-xs border-2 border-white shadow hover:bg-red-700 transition z-50"
                        title="Remove Bot"
                        onClick={() => handleRemoveBot(position)}
                        style={{ zIndex: 50 }}
                      >
                        <FaMinus className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className={`w-full px-2 py-1 rounded-lg shadow-sm ${teamGradient}`} style={{ width: isMobile ? '50px' : '70px' }}>
                  <div className="text-white font-medium truncate text-center" style={{ fontSize: isMobile ? '9px' : '11px' }}>
                    Bot
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
                    {gameState.status === "WAITING" ? "" : madeStatus}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
    if (!player) return null;

    const isActive = gameState.status !== "WAITING" && gameState.currentPlayer === player.id;
    
    // Get player avatar
    const getPlayerAvatar = (player: Player | null) => {
      if (!player) return '/guest-avatar.png';
      return player.avatar ?? '/guest-avatar.png';
    };

    // Determine if this is a left/right seat (position 1 or 3)
    const isSideSeat = position === 1 || position === 3;
    
    // Calculate sizes based on device
    const avatarWidth = isMobile ? 32 : 40;
    const avatarHeight = isMobile ? 32 : 40;
    
    // Determine made/bid status color
    const madeCount = player.tricks || 0;
    const bidCount = player.bid !== undefined ? player.bid : 0;
    // Replace color-based status with emoji indicators
    const madeStatus = madeCount >= bidCount 
      ? "✅" // Checkmark for met or exceeded bid
      : "❌"; // X for not met bid
    
    // Custom team colors
    const redTeamGradient = "bg-gradient-to-r from-red-700 to-red-500";
    const blueTeamGradient = "bg-gradient-to-r from-blue-700 to-blue-500";
    const teamGradient = player.team === 1 ? redTeamGradient : blueTeamGradient;
    const teamAccentColor = player.team === 1 ? 'from-red-400' : 'from-blue-400';

    return (
      <div className={`absolute ${getPositionClasses(position)} ${isActive ? 'z-10' : 'z-0'}`}>
        <div className={`
          backdrop-blur-sm bg-white/10 rounded-xl overflow-hidden
          ${isActive ? 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/30' : 'shadow-md'}
          transition-all duration-200
        `}>
          {isSideSeat ? (
            // Left/right seats - vertical layout
            <div className="flex flex-col items-center p-1.5 gap-1.5">
              {/* Avatar with glowing active border */}
              <div className={`relative`}>
                <div className={`
                  rounded-full overflow-hidden p-0.5
                  ${isActive ? 'bg-gradient-to-r from-yellow-300 to-yellow-500 animate-pulse' : 
                    `bg-gradient-to-r ${teamAccentColor} to-white/80`}
                `}>
                  <div className="bg-gray-900 rounded-full p-0.5">
                    <img
                      src={getPlayerAvatar(player)}
                      alt={player.username || "Player"}
                      width={avatarWidth}
                      height={avatarHeight}
                      className="rounded-full object-cover"
                    />
                  </div>
                  
                  {/* Dealer chip with premium styling */}
                  {player.isDealer && (
                    <div className="absolute -bottom-1 -right-1">
                      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-r from-yellow-300 to-yellow-500 shadow-md">
                        <div className="w-4 h-4 rounded-full bg-yellow-600 flex items-center justify-center">
                          <span className="text-[8px] font-bold text-yellow-200">D</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex flex-col items-center gap-1">
                {/* Player name with team color gradient background */}
                <div className={`w-full px-2 py-1 rounded-lg shadow-sm ${teamGradient}`} style={{ width: isMobile ? '50px' : '70px' }}>
                  <div className="text-white font-medium truncate text-center"
                       style={{ fontSize: isMobile ? '9px' : '11px' }}>
                    {player.username}
                  </div>
                </div>
                
                {/* Bid/Trick counter with glass morphism effect */}
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
                    {gameState.status === "WAITING" ? "" : madeStatus}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            // Top/bottom seats - horizontal layout
            <div className="flex items-center p-1.5 gap-1.5">
              {/* Avatar with glowing active border */}
              <div className={`relative`}>
                <div className={`
                  rounded-full overflow-hidden p-0.5
                  ${isActive ? 'bg-gradient-to-r from-yellow-300 to-yellow-500 animate-pulse' : 
                    `bg-gradient-to-r ${teamAccentColor} to-white/80`}
                `}>
                  <div className="bg-gray-900 rounded-full p-0.5">
                    <img
                      src={getPlayerAvatar(player)}
                      alt={player.username || "Player"}
                      width={avatarWidth}
                      height={avatarHeight}
                      className="rounded-full object-cover"
                    />
                  </div>
                  
                  {/* Dealer chip with premium styling */}
                  {player.isDealer && (
                    <div className="absolute -bottom-1 -right-1">
                      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-r from-yellow-300 to-yellow-500 shadow-md">
                        <div className="w-4 h-4 rounded-full bg-yellow-600 flex items-center justify-center">
                          <span className="text-[8px] font-bold text-yellow-200">D</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex flex-col gap-1 items-center">
                {/* Player name with team color gradient background */}
                <div className={`w-full px-2 py-1 rounded-lg shadow-sm ${teamGradient}`} style={{ width: isMobile ? '50px' : '70px' }}>
                  <div className="text-white font-medium truncate text-center"
                       style={{ fontSize: isMobile ? '9px' : '11px' }}>
                    {player.username}
                  </div>
                </div>
                
                {/* Bid/Trick counter with glass morphism effect */}
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
                    {gameState.status === "WAITING" ? "" : madeStatus}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderPlayerHand = () => {
    if (!currentPlayer) return null;
    const sortedHand = currentPlayer.hand ? sortCards(currentPlayer.hand) : [];
    
    // Determine playable cards
    const isLeadingTrick = currentTrick.length === 0;
    const playableCards = gameState.status === "PLAYING" && currentPlayer ? getPlayableCards(gameState, currentPlayer.hand || [], isLeadingTrick) : [];
    
    // Calculate card width based on screen size
    const cardUIWidth = Math.floor(isMobile ? 70 : 84 * scaleFactor);
    const cardUIHeight = Math.floor(isMobile ? 100 : 120 * scaleFactor);
    const overlapOffset = Math.floor(isMobile ? -40 : -32 * scaleFactor); // How much cards overlap

    return (
      <div className="absolute inset-x-0 bottom-0 flex justify-center">
        <div className="flex">
        {sortedHand.map((card: Card, index: number) => {
          const isPlayable = gameState.status === "PLAYING" && 
            gameState.currentPlayer === currentPlayerId &&
            playableCards.some((c: Card) => c.suit === card.suit && c.rank === card.rank);

          return (
            <div
              key={`${card.suit}${card.rank}`}
                className={`relative transition-transform hover:-translate-y-4 hover:z-10 ${
                isPlayable ? 'cursor-pointer' : 'cursor-not-allowed'
              }`}
              style={{ 
                width: `${cardUIWidth}px`, 
                height: `${cardUIHeight}px`,
                  marginLeft: index > 0 ? `${overlapOffset}px` : '0',
                  zIndex: index
              }}
              onClick={() => isPlayable && handlePlayCard(card)}
            >
              <div className="relative">
                <img
                  src={`/cards/${getCardImage(card)}`}
                  alt={`${card.rank}${card.suit}`}
                  width={cardUIWidth}
                  height={cardUIHeight}
                  className={`rounded-lg shadow-md ${
                    isPlayable ? 'hover:shadow-lg' : ''
                  }`}
                />
                {!isPlayable && (
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
    const handleHandCompleted = () => {
      console.log('Hand completed - calculating scores for display');
      
      // Calculate scores using the scoring algorithm
      const calculatedScores = calculateHandScore(sanitizedPlayers);
      
      console.log('Hand scores calculated:', calculatedScores);
      
      // Set the hand scores and show the modal
      setShowHandSummary(true);
    };
    
    // Register event listener for hand completion
    socket.on('hand_completed', handleHandCompleted);
    
    // Handle scoring state change directly in case the server doesn't emit the event
    if (gameState.status === "PLAYING" && sanitizedPlayers.every((p: Player) => p.hand.length === 0) && !showHandSummary) {
      handleHandCompleted();
    }
    
    return () => {
      socket.off('hand_completed', handleHandCompleted);
    };
  }, [socket, gameState.id, gameState.status, sanitizedPlayers, showHandSummary]);

  // Initialize the global variable
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.lastCompletedTrick = null;
    }
  }, []);

  // Calculate scores
  const team1Score = gameState?.scores?.['team1'] ?? 0;
  const team2Score = gameState?.scores?.['team2'] ?? 0;
  const team1Bags = gameState?.team1Bags ?? 0;
  const team2Bags = gameState?.team2Bags ?? 0;

  // Update cardPlayers when game state changes
  useEffect(() => {
    if (gameState.cardPlayers) {
      setCardPlayers(gameState.cardPlayers);
    }
  }, [gameState.cardPlayers]);

  // Effect to handle game completion
  useEffect(() => {
    if (!socket) return;

    const handleGameOver = (data: { team1Score: number; team2Score: number; winningTeam: 1 | 2 }) => {
      console.log('Game over event received:', data);
      setShowHandSummary(false);
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

  // Modify the renderTrickCards function
  const renderTrickCards = () => {
    // Use completed trick if available, otherwise use current trick
    const displayTrick = completedTrick ? completedTrick.cards : currentTrick;
    if (!displayTrick?.length) return null;

    return displayTrick.map((card: Card, index: number) => {
      if (!card.playedBy) {
        console.error(`Card ${card.rank}${card.suit} is missing playedBy information`);
        return null;
      }

      const relativePosition = (4 + card.playedBy.position - (currentPlayerPosition ?? 0)) % 4;

      const positions: Record<number, string> = windowSize.width < 640 ? {
        0: 'absolute bottom-16 left-1/2 transform -translate-x-1/2',
        1: 'absolute left-8 top-1/2 transform -translate-y-1/2',
        2: 'absolute top-16 left-1/2 transform -translate-x-1/2',
        3: 'absolute right-8 top-1/2 transform -translate-y-1/2'
      } : {
        0: 'absolute bottom-[20%] left-1/2 transform -translate-x-1/2',
        1: 'absolute left-[20%] top-1/2 transform -translate-y-1/2',
        2: 'absolute top-[20%] left-1/2 transform -translate-x-1/2',
        3: 'absolute right-[20%] top-1/2 transform -translate-y-1/2'
      };

      const isWinningCard = completedTrick && 
        card.suit === completedTrick.winningCard.suit && 
        card.rank === completedTrick.winningCard.rank;

      // Calculate card dimensions using the same approach as player's hand
      const cardUIWidth = windowSize.width < 640 ? 25 : Math.floor(96 * getScaleFactor());
      const cardUIHeight = windowSize.width < 640 ? 38 : Math.floor(144 * getScaleFactor());

      return (
        <div
          key={`${card.suit}-${card.rank}-${index}`}
          className={`${positions[relativePosition]} z-10 transition-all duration-500
            ${isWinningCard ? 'ring-2 ring-yellow-400 scale-110 z-20' : ''}`}
          style={{
            width: `${cardUIWidth}px`,
            height: `${cardUIHeight}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 'unset'
          }}
        >
          <img
            src={`/cards/${getCardImage(card)}`}
            alt={`${card.rank} of ${card.suit}`}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain'
            }}
          />
          {isWinningCard && (
            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 
              bg-yellow-400 text-black font-bold rounded-full px-3 py-1
              animate-bounce">
              +1
            </div>
          )}
        </div>
      );
    }).filter(Boolean);
  };

  const handlePlayAgain = () => {
    if (!socket) return;
    socket.emit('play_again', { gameId: gameState.id });
  };

  useEffect(() => {
    if (!socket) return;

    socket.on('player_wants_to_play_again', (data: { playerId: string }) => {
      setCardPlayers(prev => ({ ...prev, [data.playerId]: data.playerId }));
    });

    socket.on('game_restarting', () => {
      setCardPlayers({});
      setShowHandSummary(false);
      setShowWinner(false);
      setShowLoser(false);
      if (socket) {
        socket.emit('leave_game', { gameId: gameState.id, userId: propUser?.id });
      }
      onLeaveTable();
    });

    return () => {
      socket.off('player_wants_to_play_again');
      socket.off('game_restarting');
    };
  }, [socket, propUser?.id, onLeaveTable]);

  // Add state for trick completion animation
  const [completedTrick, setCompletedTrick] = useState<CompletedTrick | null>(null);

  // Effect to handle trick completion
  useEffect(() => {
    if (!socket) return;

    const handleTrickComplete = (data: CompletedTrick) => {
      setCompletedTrick(data);
      
      // Clear completed trick after delay
      const timer = setTimeout(() => {
        setCompletedTrick(null);
      }, 3000);

      return () => clearTimeout(timer);
    };

    socket.on('trick_complete', handleTrickComplete);

    return () => {
      socket.off('trick_complete', handleTrickComplete);
    };
  }, [socket]);

  // When playing a card, we now rely solely on server data for tracking
  const handlePlayCard = (card: Card) => {
    if (!socket || !currentPlayerId || !currentPlayer) return;

    // Validate if it's player's turn
    if (gameState.currentPlayer !== currentPlayerId) {
      console.error(`Cannot play card: Not your turn`);
      return;
    }

    // Check if card is playable
    const isLeadingTrick = currentTrick.length === 0;
    const playableCards = currentPlayer ? getPlayableCards(gameState, currentPlayer.hand, isLeadingTrick) : [];
    if (!playableCards.some((c: Card) => c.suit === card.suit && c.rank === card.rank)) {
      console.error('This card is not playable in the current context');
      return;
    }

    console.log(`Playing card: ${card.rank}${card.suit} as player ${currentPlayer?.name ?? 'Unknown'}`);
    
    // Update our local tracking immediately to know that current player played this card
    // This helps prevent the "Unknown" player issue when we play our own card
    const updatedMapping = { ...cardPlayers };
    updatedMapping[currentTrick.length.toString()] = currentPlayerId;
    setCardPlayers(updatedMapping);
    
    // Send the play to the server
    socket.emit("play_card", { 
      gameId: gameState.id, 
      userId: currentPlayerId, 
      card 
    });
  };

  const handleLeaveTable = () => {
    console.log("Leave Table clicked");
    console.log("Socket connected:", socket?.connected);
    if (socket) {
      socket.emit('leave_game', { gameId: gameState.id, userId: currentPlayerId });
    } else {
      console.error("Socket is undefined. Cannot emit leave_game event.");
    }
    onLeaveTable();
  };

  const handleStartGame = async () => {
    if (!currentPlayerId) return;
    
    // Make sure the game is in the WAITING state
    if (gameState.status !== "WAITING") {
      console.error(`Cannot start game: game is in ${gameState.status} state, not WAITING`);
      return;
    }
    
    // Make sure the game has enough players
    if (sanitizedPlayers.length < 4) {
      console.error(`Cannot start game: only ${sanitizedPlayers.length}/4 players joined`);
      return;
    }
    
    // Make sure current user is the creator (first player)
    if (sanitizedPlayers[0]?.id !== currentPlayerId) {
      console.error(`Cannot start game: current user ${currentPlayerId} is not the creator ${sanitizedPlayers[0]?.id}`);
      return;
    }
    
    try {
      console.log(`Starting game ${gameState.id} as user ${currentPlayerId}, creator: ${sanitizedPlayers[0]?.id}`);
      await startGame(gameState.id, currentPlayerId);
    } catch (error) {
      console.error("Failed to start game:", error);
    }
  };

  // Listen for game_update and update the UI
  useEffect(() => {
    if (!socket) return;
    const handleGameUpdate = (updatedGame: any) => {
      setGameState(updatedGame);
    };
    socket.on('game_update', handleGameUpdate);
    return () => {
      socket.off('game_update', handleGameUpdate);
    };
  }, [socket]);

  // Add a useEffect to log the socket connection status when the component mounts
  useEffect(() => {
    console.log("Socket connection status on mount:", socket?.connected);
  }, [socket]);

  // Add a useEffect to log the socket connection status whenever the socket prop changes
  useEffect(() => {
    console.log("Socket connection status changed:", socket?.connected);
  }, [socket]);

  // Add this effect:
  useEffect(() => {
    if (!socket || !gameState?.id || !propUser?.id) return;

    const handleAuthenticated = (data: any) => {
      if (data.success && data.userId === propUser.id) {
        console.log('Authenticated, now joining game:', gameState.id);
        socket.emit('join_game', { gameId: gameState.id, userId: propUser.id });
      }
    };

    socket.on('authenticated', handleAuthenticated);

    return () => {
      socket.off('authenticated', handleAuthenticated);
    };
  }, [socket, gameState?.id, propUser?.id]);

  // Return the JSX for the component
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
                    <div className="absolute left-0 mt-2 w-56 bg-gray-900/95 border border-gray-700 rounded-lg shadow-xl p-4 z-50 text-sm text-white">
                      <div className="font-bold mb-2 flex items-center gap-2">
                        <IoInformationCircleOutline className="inline-block h-4 w-4 text-blue-400" />
                        Table Details
                      </div>
                      <div className="flex flex-col gap-1">
                        <div><span className="text-gray-400">Type:</span> {gameState.rules?.gameType || 'REGULAR'}</div>
                        <div><span className="text-gray-400">Points:</span> {gameState.maxPoints ?? 500}/{gameState.minPoints ?? -150}</div>
                        {(gameState.rules?.gameType === 'REGULAR' || gameState.rules?.gameType === 'SOLO') && (
                          <>
                            <div><span className="text-gray-400">Nil:</span> {gameState.rules?.allowNil ? '✅ Allowed' : '❌ Not allowed'}</div>
                            <div><span className="text-gray-400">Blind Nil:</span> {gameState.rules?.allowBlindNil ? '✅ Allowed' : '❌ Not allowed'}</div>
                          </>
                        )}
                        <div className="mt-2 pt-2 border-t border-gray-700">
                          <div className="text-sm">
                            <span className="text-gray-400">Buy-in:</span>
                            <span className="font-bold text-yellow-400 ml-2">{gameState.rules?.coinAmount ? `${(gameState.rules.coinAmount / 1000)}k` : '100k'}</span>
                          </div>
                          <div className="text-sm">
                            <span className="text-gray-400">Prize Pool:</span>
                            <span className="font-bold text-yellow-400 ml-2">{gameState.rules?.coinAmount ? `${((gameState.rules.coinAmount * 4 * 0.9) / 1000)}k` : '360k'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Scoreboard in top right corner - inside the table */}
              <div className="absolute top-4 right-4 z-10 flex flex-col items-center gap-2 px-3 py-2 bg-gray-800/90 rounded-lg shadow-lg">
                {/* Team 1 (Red) Score and Bags */}
                <div className="flex items-center">
                  <div className="bg-red-500 rounded-full w-2 h-2 mr-1"></div>
                  <span className="text-white font-bold mr-1 text-sm">{team1Score}</span>
                  {/* Team 1 Bags */}
                  <div className="flex items-center text-yellow-300 ml-2" title={`Team 1 Bags: ${team1Bags}`}> 
                    <img src="/bag.svg" width={16} height={16} alt="Bags" className="mr-1" />
                    <span className="text-xs font-bold">{team1Bags}</span>
                  </div>
                </div>

                {/* Team 2 (Blue) Score and Bags */}
                <div className="flex items-center">
                  <div className="bg-blue-500 rounded-full w-2 h-2 mr-1"></div>
                  <span className="text-white font-bold mr-1 text-sm">{team2Score}</span>
                  {/* Team 2 Bags */}
                  <div className="flex items-center text-yellow-300 ml-2" title={`Team 2 Bags: ${team2Bags}`}> 
                    <img src="/bag.svg" width={16} height={16} alt="Bags" className="mr-1" />
                    <span className="text-xs font-bold">{team2Bags}</span>
                  </div>
                </div>
              </div>
        
              {/* Players around the table */}
              {[0, 1, 2, 3].map((position) => (
                <div key={`player-position-${position}`}>
                  {renderPlayerPosition(position)}
                </div>
              ))}

              {/* Center content */}
              {renderTrickCards()}

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
                    <div className="text-sm mt-1">Only {sanitizedPlayers[0]?.name} can start</div>
                  </div>
                ) : gameState.status === "BIDDING" && gameState.currentPlayer === currentPlayerId ? (
                  <div className="flex items-center justify-center w-full h-full pointer-events-auto">
                    <BiddingInterface
                      onBid={handleBid}
                      currentBid={orderedPlayers[0]?.bid}
                      gameType={gameState.rules.gameType}
                      numSpades={currentPlayer ? countSpades(currentPlayer.hand) : 0}
                      playerId={currentPlayerId}
                      currentPlayerTurn={gameState.currentPlayer}
                      allowNil={gameState.rules.allowNil}
                    />
                  </div>
                ) : gameState.status === "BIDDING" && gameState.currentPlayer !== currentPlayerId ? (
                  <div className="px-4 py-2 bg-gray-700 text-white rounded-lg text-center animate-pulse pointer-events-auto"
                       style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}>
                    {(() => {
                      const waitingPlayer = sanitizedPlayers.find((p: Player) => p.id === gameState.currentPlayer);
                      return (
                        <div className="font-bold">Waiting for {waitingPlayer ? waitingPlayer.name : "Unknown"} to bid</div>
                      );
                    })()}
                  </div>
                ) : gameState.status === "PLAYING" && currentTrick?.length === 0 ? (
                  <div className="px-4 py-2 bg-gray-700/70 text-white rounded-lg text-center pointer-events-auto"
                       style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}>
                    {(() => {
                      const waitingPlayer = sanitizedPlayers.find((p: Player) => p.id === gameState.currentPlayer);
                      return (
                        <div className="text-sm">Waiting for {waitingPlayer ? waitingPlayer.name : "Unknown"} to play</div>
                      );
                    })()}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Cards area with more space */}
            <div className="bg-gray-800/50 rounded-lg relative mb-0" 
                 style={{ 
                   height: `${Math.floor(110 * scaleFactor)}px`
                 }}>
              {renderPlayerHand()}
            </div>
          </div>

          {/* Chat area - 30%, full height */}
          <div className="w-[30%] h-full overflow-hidden">
            <Chat 
              socket={socket}
              gameId={gameState.id}
              userId={currentPlayerId || ''}
              userName={currentPlayer?.name || 'Unknown'}
              players={sanitizedPlayers}
            />
          </div>
        </div>

        {/* Hand Summary Modal - Pass currentHandSummary */}
        {showHandSummary && (
          <HandSummaryModal
            isOpen={showHandSummary}
            onClose={() => setShowHandSummary(false)}
            gameState={gameState}
            onNextHand={() => {
              setShowHandSummary(false);
              // Add any next hand logic here
            }}
            onNewGame={() => {
              setShowHandSummary(false);
              // Add any new game logic here
            }}
          />
        )}

        {/* Winner Modal */}
        {showWinner && (
          <WinnerModal
            isOpen={true}
            onClose={handleLeaveTable}
            team1Score={gameState.scores.team1}
            team2Score={gameState.scores.team2}
            winningTeam={1}
            onPlayAgain={handlePlayAgain}
          />
        )}

        {/* Loser Modal */}
        {showLoser && (
          <LoserModal
            isOpen={true}
            onClose={handleLeaveTable}
            team1Score={gameState.scores.team1}
            team2Score={gameState.scores.team2}
            winningTeam={2}
            onPlayAgain={handlePlayAgain}
          />
        )}
      </div>
    </>
  );
}