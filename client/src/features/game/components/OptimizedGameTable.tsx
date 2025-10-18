// OPTIMIZED GameTable component with React.memo and performance optimizations
import React, { memo, useMemo, useCallback } from 'react';
import type { GameState } from '../../../types/game';

interface OptimizedGameTableProps {
  game: GameState;
  user: any;
  gameId: string;
  onPlayCard: (card: any) => void;
  onMakeBid: (bid: number) => void;
  onLeaveTable: () => void;
  startGame: () => void;
}

// Memoized components to prevent unnecessary re-renders
const MemoizedGameTableHeader = memo(({ game, user, onLeaveTable, startGame }: any) => {
  return (
    <div className="game-table-header">
      {/* Header content */}
    </div>
  );
});

const MemoizedGameTableScoreboard = memo(({ game }: any) => {
  return (
    <div className="game-table-scoreboard">
      {/* Scoreboard content */}
    </div>
  );
});

const MemoizedGameTablePlayers = memo(({ game, user, onPlayCard, onMakeBid }: any) => {
  return (
    <div className="game-table-players">
      {/* Players content */}
    </div>
  );
});

// Main optimized component
export const OptimizedGameTable = memo(({
  game,
  user,
  gameId,
  onPlayCard,
  onMakeBid,
  onLeaveTable,
  startGame
}: OptimizedGameTableProps) => {
  // Memoize expensive calculations
  const processedGameState = useMemo(() => {
    return {
      ...game,
      // Add any expensive processing here
    };
  }, [game.currentTrick, game.status]);

  // Memoize callback functions
  const handlePlayCard = useCallback((card: any) => {
    onPlayCard(card);
  }, [onPlayCard]);

  const handleMakeBid = useCallback((bid: number) => {
    onMakeBid(bid);
  }, [onMakeBid]);

  return (
    <div className="optimized-game-table">
      <MemoizedGameTableHeader 
        game={processedGameState} 
        user={user} 
        onLeaveTable={onLeaveTable} 
        startGame={startGame} 
      />
      <MemoizedGameTableScoreboard game={processedGameState} />
      <MemoizedGameTablePlayers 
        game={processedGameState} 
        user={user} 
        onPlayCard={handlePlayCard} 
        onMakeBid={handleMakeBid} 
      />
    </div>
  );
});

OptimizedGameTable.displayName = 'OptimizedGameTable';
