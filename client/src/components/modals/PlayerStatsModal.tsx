import React, { useState } from 'react';

interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  nilsBid: number;
  nilsMade: number;
  blindNilsBid: number;
  blindNilsMade: number;
  regPlayed?: number;
  regWon?: number;
  whizPlayed?: number;
  whizWon?: number;
  mirrorPlayed?: number;
  mirrorWon?: number;
  gimmickPlayed?: number;
  gimmickWon?: number;
  screamerPlayed?: number;
  screamerWon?: number;
  assassinPlayed?: number;
  assassinWon?: number;
}

interface Player {
  username: string;
  avatar: string;
  stats: PlayerStats;
  status: 'friend' | 'blocked' | 'not_friend';
  coins?: number;
}

interface PlayerStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  player: Player | null;
}

const PlayerStatsModal: React.FC<PlayerStatsModalProps> = ({ isOpen, onClose, player }) => {
  const [mode, setMode] = useState<'all' | 'partners' | 'solo'>('all');
  if (!isOpen || !player) return null;

  const stats = player.stats;
  const winPercent = stats.gamesPlayed ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;
  const nilPercent = stats.nilsBid ? Math.round((stats.nilsMade / stats.nilsBid) * 100) : 0;
  const blindNilPercent = stats.blindNilsBid ? Math.round((stats.blindNilsMade / stats.blindNilsBid) * 100) : 0;

  // Defaults for all game modes and special rules
  const regPlayed = stats.regPlayed ?? stats.gamesPlayed ?? 0;
  const regWon = stats.regWon ?? stats.gamesWon ?? 0;
  const whizPlayed = stats.whizPlayed ?? 0;
  const whizWon = stats.whizWon ?? 0;
  const mirrorPlayed = stats.mirrorPlayed ?? 0;
  const mirrorWon = stats.mirrorWon ?? 0;
  const gimmickPlayed = stats.gimmickPlayed ?? 0;
  const gimmickWon = stats.gimmickWon ?? 0;
  const screamerPlayed = stats.screamerPlayed ?? 0;
  const screamerWon = stats.screamerWon ?? 0;
  const assassinPlayed = stats.assassinPlayed ?? 0;
  const assassinWon = stats.assassinWon ?? 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg w-full max-w-[95vw] mx-1 p-1 sm:p-8 sm:max-w-md sm:mx-4 animate-fade-in relative border border-white/20">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white text-2xl">&times;</button>
        {/* Radio buttons */}
        <div className="flex justify-center gap-6 mb-4">
          <label className="flex items-center gap-2 cursor-pointer text-indigo-400 text-lg font-bold uppercase">
            <input type="radio" name="mode" value="all" checked={mode === 'all'} onChange={() => setMode('all')} className="w-6 h-6 accent-indigo-500" />
            ALL
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-indigo-400 text-lg font-bold uppercase">
            <input type="radio" name="mode" value="partners" checked={mode === 'partners'} onChange={() => setMode('partners')} className="w-6 h-6 accent-indigo-500" />
            PARTNERS
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-indigo-400 text-lg font-bold uppercase">
            <input type="radio" name="mode" value="solo" checked={mode === 'solo'} onChange={() => setMode('solo')} className="w-6 h-6 accent-indigo-500" />
            SOLO
          </label>
        </div>
        {/* Avatar, username, and main stats inline with border */}
        <div className="flex flex-row items-center justify-center mb-6 gap-6 border border-slate-600 rounded-lg p-4 bg-slate-900">
          {/* Left column: avatar, username, buttons */}
          <div className="flex flex-col items-center min-w-[120px]">
            <img src={player.avatar || '/bot-avatar.jpg'} alt={player.username} className="w-20 h-20 rounded-full border-4 border-indigo-600 mb-1" />
            <h2 className="text-2xl font-bold text-slate-200 mb-2">{player.username}</h2>
            {/* Friend/Block buttons below avatar and username */}
            <div className="flex flex-row gap-3 mb-2">
              {player.status === 'blocked' ? (
                <>
                  <span className="text-slate-400 text-xs mr-2 flex items-center h-8">unblock?</span>
                  <button className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-600 border border-slate-300 hover:bg-slate-500" title="Unblock">
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                      <circle cx="12" cy="12" r="11" stroke="white" strokeWidth="2" />
                      <path d="M6 18L18 6" stroke="white" strokeWidth="2.5" />
                    </svg>
                  </button>
                </>
              ) : player.status === 'friend' ? (
                <>
                  <button className="w-8 h-8 flex items-center justify-center rounded-full bg-red-600 border border-slate-300 hover:bg-red-700" title="Remove Friend">
                    <img src="/remove-friend.svg" alt="Remove Friend" className="w-5 h-5" style={{ filter: 'invert(1) brightness(2)' }} />
                  </button>
                  <button className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-600 border border-slate-300 hover:bg-slate-500" title="Block">
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                      <circle cx="12" cy="12" r="11" stroke="white" strokeWidth="2" />
                      <path d="M4 4L20 20M20 4L4 20" stroke="white" strokeWidth="2.5" />
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  <button className="w-8 h-8 flex items-center justify-center rounded-full bg-green-600 border border-slate-300 hover:bg-green-700" title="Add Friend">
                    <img src="/add-friend.svg" alt="Add Friend" className="w-5 h-5" style={{ filter: 'invert(1) brightness(2)' }} />
                  </button>
                  <button className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-600 border border-slate-300 hover:bg-slate-500" title="Block">
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                      <circle cx="12" cy="12" r="11" stroke="white" strokeWidth="2" />
                      <path d="M4 4L20 20M20 4L4 20" stroke="white" strokeWidth="2.5" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
          {/* Right column: stats vertical list */}
          <div className="flex flex-col items-start gap-2 min-w-[160px]">
            <div className="flex items-center text-2xl font-extrabold text-yellow-300">
              <svg className="w-7 h-7 mr-2" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
              {winPercent}% <span className="text-base font-normal text-slate-400 ml-1">Win %</span>
            </div>
            <div className="flex items-center text-2xl font-extrabold text-yellow-400">
              <svg className="w-5 h-5 text-yellow-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
              {(typeof player.coins === 'number' ? player.coins : 0).toLocaleString()}
            </div>
            <div className="flex items-center text-2xl font-extrabold text-indigo-400">
              <svg className="w-7 h-7 mr-2" fill="currentColor" viewBox="0 0 24 24"><path d="M3 6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6zm16 0a2 2 0 0 0-2-2h-1v16h1a2 2 0 0 0 2-2V6zm-7 2a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>
              {stats.gamesPlayed} <span className="text-base font-normal text-slate-400 ml-1">Played</span>
            </div>
            <div className="flex items-center text-2xl font-extrabold text-yellow-400">
              <svg className="w-7 h-7 mr-2" fill="currentColor" viewBox="0 0 24 24"><path d="M2 7l5 5 5-9 5 9 5-5-2 13H4L2 7zm4.24 11h11.52l1.26-8.18-3.5 3.5-3.52-6.34-3.52 6.34-3.5-3.5L6.24 18z"/></svg>
              {stats.gamesWon} <span className="text-base font-normal text-slate-400 ml-1">Won</span>
            </div>
          </div>
        </div>
        {/* Game Mode Breakdown inline */}
        <div className="mb-6">
          <h3 className="text-indigo-400 font-bold mb-1 text-center">Game Mode Breakdown</h3>
          <div className="text-xs text-slate-400 text-center mb-2">(won/played)</div>
          <div className="flex justify-between text-center mb-2">
            <div className="flex-1">
              <div className="font-semibold text-sm text-slate-200">regular</div>
              <div className="text-2xl font-extrabold text-slate-100">{regWon}/{regPlayed}</div>
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm text-slate-200">whiz</div>
              <div className="text-2xl font-extrabold text-slate-100">{whizWon}/{whizPlayed}</div>
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm text-slate-200">mirrors</div>
              <div className="text-2xl font-extrabold text-slate-100">{mirrorWon}/{mirrorPlayed}</div>
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm text-slate-200">gimmick</div>
              <div className="text-2xl font-extrabold text-slate-100">{gimmickWon}/{gimmickPlayed}</div>
            </div>
          </div>
        </div>
        {/* Special Rules inline */}
        <div className="mb-6">
          <h3 className="text-indigo-400 font-bold mb-1 text-center">Special Rules</h3>
          <div className="text-xs text-slate-400 text-center mb-2">(won/played)</div>
          <div className="flex justify-center text-center">
            <div className="flex-1">
              <div className="font-semibold text-sm text-slate-200">screamer</div>
              <div className="text-2xl font-extrabold text-slate-100">{screamerWon}/{screamerPlayed}</div>
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm text-slate-200">assassin</div>
              <div className="text-2xl font-extrabold text-slate-100">{assassinWon}/{assassinPlayed}</div>
            </div>
          </div>
        </div>
        {/* Nil/Blind Nil stats with 3 columns: Bid, Made, % Made */}
        <hr className="my-4 border-slate-700" />
        <div className="mb-2">
          <div className="grid grid-cols-3 gap-4 text-center text-slate-300">
            <div>
              <div className="font-semibold text-lg">{stats.nilsBid}</div>
              <div className="text-xs">Nils Bid</div>
              <div className="font-semibold text-lg">{stats.blindNilsBid}</div>
              <div className="text-xs">Blind Nils Bid</div>
            </div>
            <div>
              <div className="font-semibold text-lg">{stats.nilsMade}</div>
              <div className="text-xs">Nils Made</div>
              <div className="font-semibold text-lg">{stats.blindNilsMade}</div>
              <div className="text-xs">Blind Nils Made</div>
            </div>
            <div>
              <div className="font-semibold text-lg">{nilPercent}%</div>
              <div className="text-xs">Nils % Made</div>
              <div className="font-semibold text-lg">{blindNilPercent}%</div>
              <div className="text-xs">Blind Nils % Made</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerStatsModal; 