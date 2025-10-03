import React from 'react';
import GameTile from '@/components/game/GameTile';
import type { GameState } from "../../types/game";

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
  onWatchGame
}) => {
  return (
    <div
      className={
        // Desktop: span 2, Tablet/Mobile: span 1, Mobile portrait: show/hide
        'space-y-4 overflow-y-auto h-full ' +
        'lg:col-span-2 md:col-span-1 ' +
        (mobileTab === 'lobby' ? 'block' : 'hidden') +
        ' md:block'
      }
    >
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-200">Available Games</h2>
        <button
          onClick={onCreateGame}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition"
        >
          Create Game
        </button>
      </div>

      <div className="flex space-x-4 mb-4">
        <button
          onClick={() => onFilterChange('waiting')}
          className={`px-3 py-1 rounded-md ${
            filter === 'waiting' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
          }`}
        >
          Waiting
        </button>
        <button
          onClick={() => onFilterChange('in-progress')}
          className={`px-3 py-1 rounded-md ${
            filter === 'in-progress' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
          }`}
        >
          In Progress
        </button>
        <button
          onClick={() => window.open('https://discord.gg/FyYAudHwfF', '_blank')}
          className="px-3 py-1 rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700 transition flex items-center space-x-2 border border-white"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
          <span>LEAGUE</span>
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
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
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default GamesSection;
