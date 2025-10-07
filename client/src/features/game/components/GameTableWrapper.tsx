import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { useGameState } from '../hooks/useGameState';
import GameTable from './GameTable';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import GameChat from '@/components/game/components/GameChat';
import BotManagement from '@/components/game/components/BotManagement';

interface GameTableWrapperProps {
  onLeaveTable: () => void;
}

export default function GameTableWrapper({ onLeaveTable }: GameTableWrapperProps) {
  const { gameId } = useParams<{ gameId: string }>();
  const { user } = useAuth();
  
  // Modal state
  const [showStartWarning, setShowStartWarning] = useState(false);
  const [showBotWarning, setShowBotWarning] = useState(false);
  const [showHandSummary, setShowHandSummary] = useState(false);
  const [handSummaryData, setHandSummaryData] = useState<any>(null);
  const [isStartingFromEmptySeats, setIsStartingFromEmptySeats] = useState(false);
  const [hasManuallyInvitedBots, setHasManuallyInvitedBots] = useState(false);
  
  const {
    gameState,
    error,
    isLoading,
    joinGame,
    leaveGame,
    makeBid,
    playCard,
    inviteBot,
    socket
  } = useGameState(gameId || '', user?.id || '');

  // Keep last known good state to prevent flicker or forced navigation during transient disconnects
  const [lastGoodGameState, setLastGoodGameState] = useState<any>(null);
  useEffect(() => {
    if (gameState) {
      setLastGoodGameState(gameState);
      
      // Reset the flag when game status changes from WAITING
      if (gameState.status !== 'WAITING' && isStartingFromEmptySeats) {
        setIsStartingFromEmptySeats(false);
      }
    }
  }, [gameState, isStartingFromEmptySeats]);

  // Custom start game handler that checks for empty seats
  const handleStartGame = async () => {
    if (!gameState || !user?.id) return;
    
    // Check for empty seats - server expects 4 seats, count missing ones
    const players = gameState.players || [];
    const emptySeats = Math.max(0, 4 - players.filter((p: any) => p).length);
    
    console.log('[DEBUG] handleStartGame called - emptySeats:', emptySeats, 'players:', gameState.players);
    
    if (emptySeats > 0) {
      // Show warning modal for empty seats
      console.log('[DEBUG] Setting showStartWarning to true');
      setShowStartWarning(true);
      return;
    }
    
    // Check for bot players when all seats are full
    const hasBotPlayers = players.some((p: any) => p && p.type === 'bot');
    console.log('[DEBUG] Bot check - hasBotPlayers:', hasBotPlayers, 'isStartingFromEmptySeats:', isStartingFromEmptySeats);
    if (hasBotPlayers && !isStartingFromEmptySeats) {
      // Show bot warning modal ONLY if we're not starting from empty seats
      console.log('[DEBUG] Setting showBotWarning to true');
      setShowBotWarning(true);
      return;
    } else if (hasBotPlayers && isStartingFromEmptySeats) {
      console.log('[DEBUG] Skipping bot warning modal because isStartingFromEmptySeats is true');
    }
    
    // No empty seats and no bots, start the game directly as rated
    console.log('[DEBUG] No empty seats and no bots, starting game directly as rated');
    if (socket) {
      socket.emit('start_game', { gameId: gameState.id, rated: true });
    }
  };

  // Handle starting game with bots (from empty seats modal) - INVITES BOTS FIRST
  const handleStartWithBots = async () => {
    console.log('[DEBUG] ===== EMPTY SEATS MODAL: Inviting bots first =====');
    setShowStartWarning(false);
    setIsStartingFromEmptySeats(true);
    
    // Fill empty seats with bots before starting
    if (!gameState || !user?.id) return;
    
    const players = Array.isArray(gameState.players) ? gameState.players : [];
    const emptySeatIndexes: number[] = [];
    for (let i = 0; i < 4; i++) {
      const seatPlayer = players[i];
      if (!seatPlayer) emptySeatIndexes.push(i);
    }
    
    console.log('[DEBUG] Empty seat indexes:', emptySeatIndexes);
    
    // Fill each empty seat with a bot
    for (const seatIndex of emptySeatIndexes) {
      console.log('[DEBUG] Inviting bot to seat:', seatIndex);
      console.log('[DEBUG] Socket available:', !!socket);
      console.log('[DEBUG] GameState available:', !!gameState);
      console.log('[DEBUG] GameId:', gameState?.id);
      inviteBot(seatIndex);
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    
    // Wait for bots to be added, then start the game as unrated
    console.log('[DEBUG] Waiting for bots to be added...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('[DEBUG] Starting game with bots...');
    if (socket && gameState?.id) {
      socket.emit('start_game', { gameId: gameState.id, rated: false });
    }
  };

  // Close start warning modal
  const handleCloseStartWarning = () => {
    setShowStartWarning(false);
  };

  // Handle starting game with bots (from bot warning modal) - STARTS DIRECTLY
  const handleStartWithBotsFromWarning = () => {
    console.log('[DEBUG] ===== BOT WARNING MODAL: Starting game directly =====');
    setShowBotWarning(false);
    if (socket && gameState?.id) {
      socket.emit('start_game', { gameId: gameState.id, rated: false });
    }
  };

  // Handle loading state: if we have prior state, keep rendering the table instead of a loading screen
  if (isLoading && lastGoodGameState) {
    // fall through to render GameTable with lastGoodGameState
  } else if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoadingSpinner />
        <p className="ml-4 text-lg">Connecting to game...</p>
      </div>
    );
  }

  // Handle error state - only route to lobby for terminal errors; otherwise stay on table
  if (error) {
    const isTerminal = /not a member|game not found|deleted/i.test(error || '');
    if (isTerminal) {
      onLeaveTable();
      try { localStorage.removeItem('activeGameId'); } catch {}
      return null;
    }
    // Non-terminal/transient error: if we have prior state, keep showing the table; otherwise light spinner
    if (!lastGoodGameState) {
      return (
        <div className="flex items-center justify-center h-screen">
          <LoadingSpinner />
          <p className="ml-4 text-lg">Connecting to game...</p>
        </div>
      );
    }
  }

  // Handle no game state: keep the spinner rather than bouncing to lobby to prevent flicker
  const effectiveGameState = gameState || lastGoodGameState;
  if (!effectiveGameState) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoadingSpinner />
        <p className="ml-4 text-lg">Connecting to game...</p>
      </div>
    );
  }

  // Calculate empty seats and bot count
  const emptySeats = effectiveGameState ? (effectiveGameState.players || []).filter((p: any) => !p).length : 0;
  const botCount = effectiveGameState ? (effectiveGameState.players || []).filter((p: any) => p && p.type === 'bot').length : 0;

  // Render the actual game table with real-time data
  return (
    <div style={{ position: 'relative' }}>
      <GameTable
        game={effectiveGameState}
        gameId={gameId}
        user={user}
        onLeaveTable={onLeaveTable}
        // Pass socket actions
        joinGame={joinGame}
        startGame={handleStartGame}
        // Modal states
        showStartWarning={showStartWarning}
        showBotWarning={showBotWarning}
        onCloseStartWarning={handleCloseStartWarning}
        onCloseBotWarning={() => setShowBotWarning(false)}
        onStartWithBots={handleStartWithBots}
        onStartWithBotsFromWarning={handleStartWithBotsFromWarning}
        emptySeats={emptySeats}
        botCount={botCount}
        isSpectator={false}
      />
      
    </div>
  );
}
