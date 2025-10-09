import React from 'react';
import type { GameState } from "../../types/game";

interface GameTileProps {
  game: GameState;
  onJoinGame: (gameId: string, seatIndex: number) => void;
  onWatchGame: (gameId: string) => void;
}

const GameTile: React.FC<GameTileProps> = ({ game, onJoinGame, onWatchGame }) => {
  const getGameTypeBrick = (game: GameState) => {
    const type = (game as any).format || (game as any).rules?.bidType || 'REGULAR';
    let color = 'bg-green-600';
    let label = 'REGULAR';
    
    if (type === 'WHIZ') {
      color = 'bg-blue-600';
      label = 'WHIZ';
    } else if (type === 'MIRROR') {
      color = 'bg-red-600';
      label = 'MIRROR';
    } else if (type === 'GIMMICK') {
      color = 'bg-orange-500';
      // Check gimmickVariant first, then bidType for backward compatibility
      const gimmickVariant = (game as any).gimmickVariant || (game as any).rules?.gimmickType || (game as any).rules?.bidType;
      
      // Map database enum values to display labels - NEVER show "GIMMICK"
      if (gimmickVariant === 'SUICIDE') label = 'SUICIDE';
      else if (gimmickVariant === 'BID4NIL' || gimmickVariant === '4 OR NIL') label = '4 OR NIL';
      else if (gimmickVariant === 'BID3' || gimmickVariant === 'BID 3') label = 'BID 3';
      else if (gimmickVariant === 'BIDHEARTS' || gimmickVariant === 'BID HEARTS') label = 'BID ♡s';
      else if (gimmickVariant === 'CRAZY_ACES' || gimmickVariant === 'CRAZY ACES') label = 'CRAZY As';
      else label = 'UNKNOWN'; // Fallback instead of "GIMMICK"
    } else if (['SUICIDE', '4 OR NIL', 'BID 3', 'BID HEARTS', 'CRAZY ACES'].includes(type)) {
      // Handle direct gimmick variant types from bidType
      color = 'bg-orange-500';
      if (type === 'SUICIDE') label = 'SUICIDE';
      else if (type === '4 OR NIL') label = '4 OR NIL';
      else if (type === 'BID 3') label = 'BID 3';
      else if (type === 'BID HEARTS') label = 'BID ♡s';
      else if (type === 'CRAZY ACES') label = 'CRAZY As';
      else label = type.toUpperCase();
    }
    
    return <span className={`inline whitespace-nowrap ${color} text-white font-bold text-xs px-2 py-0.5 rounded mr-2`}>{label}</span>;
  };

  const getSpecialBricks = (game: GameState) => {
    const bricks = [];
    if (game.specialRules?.assassin || (game as any).rules?.specialRules?.assassin) {
      bricks.push(<span key="assassin" className="inline whitespace-nowrap bg-red-600 text-white font-bold text-xs px-2 py-0.5 rounded ml-2">ASSASSIN</span>);
    }
    if (game.specialRules?.screamer || (game as any).rules?.specialRules?.screamer) {
      bricks.push(<span key="screamer" className="inline whitespace-nowrap bg-blue-600 text-white font-bold text-xs px-2 py-0.5 rounded ml-2">SCREAMER</span>);
    }
    return bricks;
  };

  const seatMap = [
    { className: "absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center", seat: 0 },
    { className: "absolute left-8 top-1/2 -translate-y-1/2 flex flex-col items-center", seat: 1 },
    { className: "absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center", seat: 2 },
    { className: "absolute right-8 top-1/2 -translate-y-1/2 flex flex-col items-center", seat: 3 },
  ];

  return (
    <div className="bg-slate-800 rounded-lg p-4 hover:bg-slate-750 transition relative overflow-visible">
      {/* Game settings header - new layout */}
      <div className="flex items-center gap-2 text-sm mb-1">
        {getGameTypeBrick(game)}
        <span className="text-slate-300 font-medium">{game.minPoints}/{game.maxPoints}</span>
        {/* Use DB-backed flags sent by the API */}
        {((game as any).nilAllowed === true) && (
          <span className="text-slate-300 ml-2">nil <span className="align-middle">☑️</span></span>
        )}
        {((game as any).nilAllowed !== true) && (
          <span className="text-slate-300 ml-2">nil <span className="align-middle">❌</span></span>
        )}
        <span className="text-slate-300 ml-2">bn <span className="align-middle">{(game as any).blindNilAllowed ? '☑️' : '❌'}</span></span>
      </div>
      {/* Line 2: Buy-in, game mode, and special bricks */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-yellow-500 text-lg font-bold">{((game.buyIn ?? game.rules?.coinAmount ?? 100000) / 1000).toFixed(0)}k</span>
        <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
        </svg>
        <span className="ml-2 text-xs font-bold text-slate-200 uppercase">{game.gameMode || (((game as any).format || (game as any).rules?.bidType) === 'SOLO' ? 'SOLO' : 'PARTNERS')}</span>
        {/* Special bricks moved here */}
        {getSpecialBricks(game)}
      </div>
      {/* Table visualization, no negative margin */}
      <div className="relative h-44 mb-2">
        {/* Table background */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-28 bg-slate-700 rounded-full" />
        {/* Seats */}
        <div className="absolute inset-0">
          {seatMap.map(({ className, seat }) => {
            const player = game.players[seat];
            return (
              <div className={className} key={seat}>
                {player ? (
                  <div className="text-center flex flex-col items-center">
                    <img
                      src={(player as any).type === 'bot' ? '/bot-avatar.jpg' : ((player as any).avatarUrl || '/default-pfp.jpg')}
                      alt=""
                      className="w-16 h-16 rounded-full border-2 border-slate-600"
                    />
                    <span className="text-xs text-slate-200 -mt-1 block bg-slate-800/80 px-2 py-0.5 rounded-full">
                      {(player as any).type === 'bot' ? `Bot ${seat + 1}` : ((player as any).username || (player as any).name || 'Player')}
                    </span>
                  </div>
                ) : (
                  <button
                    className="w-16 h-16 rounded-full bg-slate-600 border border-slate-300 text-slate-200 text-base flex items-center justify-center hover:bg-slate-500 transition"
                    onClick={() => onJoinGame(game.id, seat)}
                  >
                    JOIN
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {/* Footer */}
      <div className="flex justify-between items-center">
        <div className="flex flex-col">
          {(game as any).league && (
            <span className="text-[10px] text-yellow-400 font-bold leading-tight">⭐ LEAGUE</span>
          )}
          <span className="text-xs text-slate-400">
            {game.status === 'WAITING' ? 'WAITING' : 'IN PROGRESS'}
          </span>
        </div>
        <button className="px-3 py-1 bg-slate-700 text-slate-300 text-xs rounded-full hover:bg-slate-600 transition" onClick={() => onWatchGame(game.id)}>
          Watch
        </button>
      </div>
    </div>
  );
};

export default GameTile;
