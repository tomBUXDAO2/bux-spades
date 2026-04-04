import React from 'react';
import type { GameState } from "../../types/game";

interface GameTileProps {
  game: GameState;
  onJoinGame: (gameId: string, seatIndex: number) => void;
  onWatchGame: (gameId: string) => void;
  canJoinOrWatch?: boolean;
  onNeedAuth?: () => void;
}

const GameTile: React.FC<GameTileProps> = ({
  game,
  onJoinGame,
  onWatchGame,
  canJoinOrWatch = true,
  onNeedAuth
}) => {
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
      else if (gimmickVariant === 'JOKER' || gimmickVariant === 'JOKER_WHIZ') label = 'JOKER';
      else label = 'UNKNOWN'; // Fallback instead of "GIMMICK"
    } else if (['SUICIDE', '4 OR NIL', 'BID 3', 'BID HEARTS', 'CRAZY ACES', 'JOKER'].includes(type)) {
      // Handle direct gimmick variant types from bidType
      color = 'bg-orange-500';
      if (type === 'SUICIDE') label = 'SUICIDE';
      else if (type === '4 OR NIL') label = '4 OR NIL';
      else if (type === 'BID 3') label = 'BID 3';
      else if (type === 'BID HEARTS') label = 'BID ♡s';
      else if (type === 'CRAZY ACES') label = 'CRAZY As';
      else if (type === 'JOKER') label = 'JOKER';
      else label = type.toUpperCase();
    }
    
    return <span className={`inline whitespace-nowrap ${color} text-white font-bold text-xs px-2 py-0.5 rounded mr-2`}>{label}</span>;
  };

  const getSpecialBricks = (game: GameState) => {
    // Handle new special rule format
    const specialRule1 = game.specialRules?.specialRule1 || (game as any).rules?.specialRules?.specialRule1;
    const specialRule2 = game.specialRules?.specialRule2 || (game as any).rules?.specialRules?.specialRule2;

    const rule1Brick = (() => {
      if (specialRule1 === 'SCREAMER') return <span key="screamer" className="inline whitespace-nowrap bg-blue-600 text-white font-bold text-xs px-2 py-0.5 rounded ml-2">SCREAMER</span>;
      if (specialRule1 === 'ASSASSIN') return <span key="assassin" className="inline whitespace-nowrap bg-red-600 text-white font-bold text-xs px-2 py-0.5 rounded ml-2">ASSASSIN</span>;
      if (specialRule1 === 'SECRET_ASSASSIN') return <span key="secret-assassin" className="inline whitespace-nowrap bg-purple-600 text-white font-bold text-xs px-2 py-0.5 rounded ml-2">SECRET</span>;
      if ((game as any).rules?.specialRules?.assassin) return <span key="assassin-bc" className="inline whitespace-nowrap bg-red-600 text-white font-bold text-xs px-2 py-0.5 rounded ml-2">ASSASSIN</span>;
      if ((game as any).rules?.specialRules?.screamer) return <span key="screamer-bc" className="inline whitespace-nowrap bg-blue-600 text-white font-bold text-xs px-2 py-0.5 rounded ml-2">SCREAMER</span>;
      return null;
    })();

    const rule2Brick = (() => {
      if (specialRule2 === 'LOWBALL') return <span key="lowball" className="inline whitespace-nowrap bg-green-600 text-white font-bold text-xs px-2 py-0.5 rounded ml-2">LOWBALL</span>;
      if (specialRule2 === 'HIGHBALL') return <span key="highball" className="inline whitespace-nowrap bg-yellow-600 text-white font-bold text-xs px-2 py-0.5 rounded ml-2">HIGHBALL</span>;
      return null;
    })();

    if (rule1Brick && rule2Brick) {
      // Stack vertically to occupy an extra row, centered
      return (
        <div className="flex flex-col ml-2 items-center">
          <div className="flex items-center">{rule1Brick}</div>
          <div className="flex items-center mt-1">{rule2Brick}</div>
        </div>
      );
    }

    return rule1Brick || rule2Brick;
  };

  const seatMap = [
    { className: "absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center", seat: 0 },
    { className: "absolute left-8 top-1/2 -translate-y-1/2 flex flex-col items-center", seat: 1 },
    { className: "absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center", seat: 2 },
    { className: "absolute right-8 top-1/2 -translate-y-1/2 flex flex-col items-center", seat: 3 },
  ];

  return (
    <div className="relative overflow-visible rounded-xl border border-white/10 bg-slate-950/40 p-4 shadow-lobby-sm backdrop-blur-sm transition hover:border-cyan-500/25 hover:shadow-lobby">
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
      {/* Line 2: Buy-in, game mode, and special bricks (stack specials if both present) */}
      <div className="flex items-center gap-2 mb-4">
        <span className="bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-lg font-bold text-transparent">{((game.buyIn ?? game.rules?.coinAmount ?? 100000) / 1000).toFixed(0)}k</span>
        <svg className="h-5 w-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
        </svg>
        <span className="ml-2 text-xs font-bold text-slate-200 uppercase">{game.gameMode || (((game as any).format || (game as any).rules?.bidType) === 'SOLO' ? 'SOLO' : 'PARTNERS')}</span>
        {/* Special bricks moved here */}
        {getSpecialBricks(game)}
      </div>
      {/* Table visualization, no negative margin */}
      <div className="relative h-44 mb-2">
        {/* Table background */}
        <div className="absolute left-1/2 top-1/2 h-28 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-b from-slate-700/90 to-slate-800/90 ring-1 ring-white/10" />
        {/* Seats */}
        <div className="absolute inset-0">
          {seatMap.map(({ className, seat }) => {
            const player = game.players[seat];
            return (
              <div className={className} key={seat}>
                {player ? (
                  <div className="text-center flex flex-col items-center">
                    {(() => {
                      const isBot = (player as any).isHuman === false || (player as any).type === 'bot' || String((player as any).username || '').startsWith('Bot');
                      const avatarSrc = isBot ? '/bot-avatar.jpg' : ((player as any).avatarUrl || '/default-pfp.jpg');
                      return (
                        <img
                          src={avatarSrc}
                          alt=""
                          className="h-16 w-16 rounded-full border-2 border-white/15"
                        />
                      );
                    })()}
                    <span className="-mt-1 block rounded-full border border-white/5 bg-slate-950/70 px-2 py-0.5 text-xs text-slate-200 backdrop-blur-sm">
                      {(() => {
                        const isBot = (player as any).isHuman === false || (player as any).type === 'bot' || String((player as any).username || '').startsWith('Bot');
                        return isBot ? `Bot ${seat + 1}` : ((player as any).username || (player as any).name || 'Player');
                      })()}
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={`flex h-16 w-16 items-center justify-center rounded-full border text-base text-slate-200 transition ${
                      canJoinOrWatch
                        ? 'border-cyan-400/40 bg-gradient-to-br from-slate-600 to-slate-700 hover:border-cyan-400/60 hover:from-slate-500 hover:to-slate-600'
                        : 'cursor-not-allowed border-white/10 bg-slate-800/80 opacity-60'
                    }`}
                    onClick={() => {
                      if (!canJoinOrWatch) {
                        onNeedAuth?.();
                        return;
                      }
                      onJoinGame(game.id, seat);
                    }}
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
        <button
          type="button"
          className={`rounded-full px-3 py-1 text-xs transition ${
            canJoinOrWatch
              ? 'border border-white/10 bg-white/5 text-slate-200 hover:border-cyan-500/30 hover:bg-cyan-950/40'
              : 'cursor-not-allowed border border-white/5 bg-slate-900/50 text-slate-600'
          }`}
          onClick={() => {
            if (!canJoinOrWatch) {
              onNeedAuth?.();
              return;
            }
            onWatchGame(game.id);
          }}
        >
          Watch
        </button>
      </div>
    </div>
  );
};

export default GameTile;
