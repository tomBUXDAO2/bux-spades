import React from 'react';
import type { GameState } from '../../types/game';
import Button from '@/components/ui/button';

interface GameCardProps {
  game: GameState;
  onJoin: (gameId: string) => void;
  onSelect: (game: GameState) => void;
  currentUserId: string;
}

export default function GameCard({ game, onJoin, onSelect, currentUserId }: GameCardProps) {
  const isPlayerInGame = game.players.some(player => player.id === currentUserId);
  const isGameFull = game.players.length >= 4;
  const isGameStarted = game.status === 'PLAYING';

  return (
    <div className="bg-gray-800 rounded-lg p-4 mb-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold text-white">Game #{game.id}</h3>
        <span className={`px-2 py-1 rounded text-sm ${
          isGameStarted ? 'bg-green-600' : 'bg-blue-600'
        } text-white`}>
          {isGameStarted ? 'In Progress' : 'Waiting'}
        </span>
      </div>
      
      <div className="mb-4">
        <p className="text-gray-300 text-sm">Players: {game.players.length}/4</p>
        <div className="flex flex-wrap gap-2 mt-1">
          {game.players.map(player => (
            <span key={player.id} className="text-sm text-gray-400">
              {player.name}
            </span>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {isPlayerInGame ? (
          <Button
            onClick={() => onSelect(game)}
            variant="default"
          >
            Return to Game
          </Button>
        ) : (
          <Button
            onClick={() => onJoin(game.id)}
            disabled={isGameFull || isGameStarted}
            variant="default"
          >
            {isGameFull ? 'Game Full' : 'Join Game'}
          </Button>
        )}
      </div>
    </div>
  );
} 