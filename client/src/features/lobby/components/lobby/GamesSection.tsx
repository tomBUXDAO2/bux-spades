import React from 'react';
import GameTile from '@/components/game/GameTile';
import type { GameState } from "../../../../types/game";

interface GamesSectionProps {
  games: GameState[];
  filteredGames: GameState[];
  isLoading: boolean;
  filter: string;
  mobileTab: 'lobby' | 'chat';
  onFilterChange: (filter: string) => void;
  onCreateGame: () => void;
  onJoinGame: (gameId: string, seatIndex: number) => void;
  onWatchGame: (gameId: string) => void;
  canCreateGame: boolean;
  canJoinOrWatch: boolean;
  onNeedAuth?: () => void;
}

const GamesSection: React.FC<GamesSectionProps> = ({
  games,
  filteredGames,
  isLoading,
  filter,
  mobileTab,
  onFilterChange,
  onCreateGame,
  onJoinGame,
  onWatchGame,
  canCreateGame,
  canJoinOrWatch,
  onNeedAuth
}) => {
  // Detect screen width for responsive sizing
  const [screenWidth, setScreenWidth] = React.useState(window.innerWidth);
  
  React.useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Apply scaling for 600-649px screens (landscape)
  const isSmallScreen = screenWidth >= 600 && screenWidth <= 649;
  // Apply medium scaling for 650-699px screens
  const isMediumScreen = screenWidth >= 650 && screenWidth <= 699;
  // Apply large scaling for 700-749px screens
  const isLargeScreen = screenWidth >= 700 && screenWidth <= 749;
  // Apply extra large scaling for 750-799px screens
  const isExtraLargeScreen = screenWidth >= 750 && screenWidth <= 799;
  const textScale = isSmallScreen ? 0.85 : (isMediumScreen ? 0.9 : (isLargeScreen ? 0.95 : (isExtraLargeScreen ? 0.98 : 1)));
  
  return (
    <div
      className="space-y-2 sm:space-y-4 overflow-y-auto h-full col-span-2 block p-2 sm:p-0"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-xl font-bold tracking-tight text-transparent sm:text-2xl" style={{ fontSize: `${isSmallScreen ? 18 : (isMediumScreen ? 20 : (isLargeScreen ? 22 : (isExtraLargeScreen ? 23 : (screenWidth >= 640 ? 24 : 20))))}px` }}>Available Games</h2>
        <button
          type="button"
          onClick={() => {
            if (!canCreateGame) {
              onNeedAuth?.();
              return;
            }
            onCreateGame();
          }}
          className={`lobby-button rounded-lg px-2 py-1 font-semibold transition sm:px-4 sm:py-2 ${
            canCreateGame
              ? 'bg-gradient-to-r from-cyan-500 to-teal-600 text-white shadow-md shadow-cyan-950/35 hover:from-cyan-400 hover:to-teal-500'
              : 'cursor-not-allowed border border-white/10 bg-white/5 text-slate-500'
          }`}
          style={{ fontSize: `${14 * textScale}px` }}
        >
          Create Game
        </button>
      </div>

      <div className="flex space-x-2 sm:space-x-4 mb-4">
        <button
          onClick={() => onFilterChange('waiting')}
          className={`lobby-button rounded-lg px-2 py-1 font-medium transition sm:px-3 ${
            filter === 'waiting'
              ? 'bg-gradient-to-r from-cyan-500 to-teal-600 text-white shadow-md shadow-cyan-950/30'
              : 'border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
          }`}
          style={{ fontSize: `${12 * textScale}px` }}
        >
          Waiting
        </button>
        <button
          onClick={() => onFilterChange('in-progress')}
          className={`lobby-button rounded-lg px-2 py-1 font-medium transition sm:px-3 ${
            filter === 'in-progress'
              ? 'bg-gradient-to-r from-cyan-500 to-teal-600 text-white shadow-md shadow-cyan-950/30'
              : 'border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
          }`}
          style={{ fontSize: `${12 * textScale}px` }}
        >
          In Progress
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400"></div>
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="py-8 text-center text-slate-500" style={{ fontSize: `${14 * textScale}px` }}>
          No games available. Why not create one?
        </div>
      ) : (
        <div
          className={
            // 2 columns on desktop/tablet landscape, 1 column on tablet portrait/mobile
            'grid gap-4 ' +
            'lg:grid-cols-2 md:grid-cols-1 grid-cols-1'
          }
        >
          {filteredGames.map(game => (
            <GameTile 
              key={game.id} 
              game={game} 
              onJoinGame={onJoinGame}
              onWatchGame={onWatchGame}
              canJoinOrWatch={canJoinOrWatch}
              onNeedAuth={onNeedAuth}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default GamesSection;
