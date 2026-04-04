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
      className="space-y-2 sm:space-y-4 overflow-y-auto h-full lg:col-span-2 col-span-1 block p-2 sm:p-0"
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
        <button
          onClick={() => window.open('https://discord.gg/FyYAudHwfF', '_blank')}
          className="lobby-button flex items-center space-x-1 rounded-lg border border-indigo-400/30 bg-indigo-950/40 px-2 py-1 text-indigo-100 transition hover:border-indigo-400/50 hover:bg-indigo-950/70 sm:space-x-2 sm:px-3"
          style={{ fontSize: `${12 * textScale}px` }}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
          <span>LEAGUE</span>
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
