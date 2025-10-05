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
  
  const {
    gameState,
    error,
    isLoading,
    joinGame,
    leaveGame,
    makeBid,
    playCard,
    startGame: originalStartGame
  } = useGameState(gameId || '', user?.id || '');

  // Keep last known good state to prevent flicker or forced navigation during transient disconnects
  const [lastGoodGameState, setLastGoodGameState] = useState<any>(null);
  useEffect(() => {
    if (gameState) {
      setLastGoodGameState(gameState);
    }
  }, [gameState]);

  // Custom start game handler that checks for empty seats
  const handleStartGame = async () => {
    if (!gameState || !user?.id) return;
    
    // Check for empty seats
    const emptySeats = (gameState.players || []).filter((p: any) => !p).length;
    
    if (emptySeats > 0) {
      // Show warning modal for empty seats
      setShowStartWarning(true);
      return;
    }
    
    // No empty seats, start the game directly
    originalStartGame();
  };

  // Handle starting game with bots (from bot warning modal)
  const handleStartWithBots = async () => {
    setShowStartWarning(false);
    originalStartGame();
  };

  // Close start warning modal
  const handleCloseStartWarning = () => {
    setShowStartWarning(false);
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
        // Modal states
        showStartWarning={showStartWarning}
        showBotWarning={showBotWarning}
        onCloseStartWarning={handleCloseStartWarning}
        onCloseBotWarning={() => setShowBotWarning(false)}
        emptySeats={emptySeats}
        botCount={botCount}
        isSpectator={false}
      />
      
    </div>
  );
}
