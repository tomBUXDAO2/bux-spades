import React, { useState, useEffect } from 'react';
import { api } from '@/services/lib/api';
import { abbreviateBotName } from '@/utils/botUtils';

interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  totalBags?: number;
  bagsPerGame?: number;
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
  // Mode-specific totals
  partnersGamesPlayed?: number;
  partnersGamesWon?: number;
  soloGamesPlayed?: number;
  soloGamesWon?: number;
  totalCoinsWon?: number; // Added for new code
}

interface Player {
  username: string;
  avatar: string;
  avatarUrl?: string; // Support both avatar and avatarUrl properties
  stats: PlayerStats;
  status: 'friend' | 'blocked' | 'not_friend';
  coins?: number;
  id?: string; // Add id for API calls
  type?: 'human' | 'bot';
}

interface PlayerStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  player: Player | null;
}

const PlayerStatsModal: React.FC<PlayerStatsModalProps> = ({ isOpen, onClose, player }) => {
  const [mode, setMode] = useState<'all' | 'partners' | 'solo'>('all');
  const [currentStats, setCurrentStats] = useState<PlayerStats | null>(null);
  
  // Detect screen width for responsive sizing
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [screenHeight, setScreenHeight] = useState(window.innerHeight);
  
  useEffect(() => {
    const handleResize = () => {
      setScreenWidth(window.innerWidth);
      setScreenHeight(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Detect portrait mode
  const isPortrait = screenHeight > screenWidth;
  
  // Apply scaling for 600-649px screens (landscape)
  const isSmallScreen = screenWidth >= 600 && screenWidth <= 649;
  // Apply medium scaling for 650-699px screens
  const isMediumScreen = screenWidth >= 650 && screenWidth <= 699;
  // Apply large scaling for 700-749px screens
  const isLargeScreen = screenWidth >= 700 && screenWidth <= 749;
  // Apply extra large scaling for 750-799px screens
  const isExtraLargeScreen = screenWidth >= 750 && screenWidth <= 799;
  // Apply larger scaling for 800-849px screens
  const isLargerScreen = screenWidth >= 800 && screenWidth <= 849;
  // Apply even larger scaling for 850-899px screens
  const isEvenLargerScreen = screenWidth >= 850 && screenWidth <= 899;
  const textScale = isSmallScreen ? 0.7 : (isMediumScreen ? 0.85 : (isLargeScreen ? 0.95 : (isExtraLargeScreen ? 0.98 : (isLargerScreen ? 0.99 : (isEvenLargerScreen ? 0.995 : 1)))));
  const iconScale = isSmallScreen ? 0.7 : (isMediumScreen ? 0.85 : (isLargeScreen ? 0.95 : (isExtraLargeScreen ? 0.98 : (isLargerScreen ? 0.99 : (isEvenLargerScreen ? 0.995 : 1)))));
  const paddingScale = isSmallScreen ? 0.6 : (isMediumScreen ? 0.7 : (isLargeScreen ? 0.85 : (isExtraLargeScreen ? 0.9 : (isLargerScreen ? 0.95 : (isEvenLargerScreen ? 0.97 : 1)))));

  const formatSigned = (value: number) => (value > 0 ? `+${value}` : `${value}`);

  // Fetch stats when mode changes or player changes
  useEffect(() => {
    if (!isOpen || !player || !player.id) return;

    const fetchStats = async () => {
      try {
        const gameModeParam = mode === 'all' ? 'ALL' : mode.toUpperCase();
        const url = `/api/users/${player.id}/stats?gameMode=${gameModeParam}`;
        console.log('[PLAYER STATS MODAL] Fetching stats with URL:', url, 'Mode:', mode, 'GameModeParam:', gameModeParam);
        const response = await api.get(url);
        const result = await response.json();
        console.log('[PLAYER STATS MODAL] Received stats:', result);
        
        // Map API response to component interface
        const mappedStats: PlayerStats = {
          gamesPlayed: result.data.totalGames || 0,
          gamesWon: result.data.gamesWon || 0,
          totalBags: result.data.bags?.total || 0,
          bagsPerGame: result.data.bags?.perGame || 0,
          nilsBid: result.data.nils?.bid || 0,
          nilsMade: result.data.nils?.made || 0,
          blindNilsBid: result.data.blindNils?.bid || 0,
          blindNilsMade: result.data.blindNils?.made || 0,
          regPlayed: result.data.formatBreakdown?.regular?.played || 0,
          regWon: result.data.formatBreakdown?.regular?.won || 0,
          whizPlayed: result.data.formatBreakdown?.whiz?.played || 0,
          whizWon: result.data.formatBreakdown?.whiz?.won || 0,
          mirrorPlayed: result.data.formatBreakdown?.mirror?.played || 0,
          mirrorWon: result.data.formatBreakdown?.mirror?.won || 0,
          gimmickPlayed: result.data.formatBreakdown?.gimmick?.played || 0,
          gimmickWon: result.data.formatBreakdown?.gimmick?.won || 0,
          screamerPlayed: result.data.specialRulesBreakdown?.screamer?.played || 0,
          screamerWon: result.data.specialRulesBreakdown?.screamer?.won || 0,
          assassinPlayed: result.data.specialRulesBreakdown?.assassin?.played || 0,
          assassinWon: result.data.specialRulesBreakdown?.assassin?.won || 0,
          totalCoinsWon: result.data.totalCoins || 0,
        };
        
        setCurrentStats(mappedStats);
      } catch (error) {
        console.error('Error fetching player stats:', error);
        // Fallback to original stats
        setCurrentStats(player.stats);
      }
    };

    fetchStats();
  }, [isOpen, player, mode]);

  if (!isOpen || !player) return null;

  const stats = currentStats || player.stats || {
    gamesPlayed: 0,
    gamesWon: 0,
    nilsBid: 0,
    nilsMade: 0,
    blindNilsBid: 0,
    blindNilsMade: 0,
  } as any;

  const displayCoins = (stats as any)?.coins ?? player.coins ?? 0;

  // Calculate game mode breakdown
  const gameModeBreakdown = {
    regular: `${stats.regWon || 0}/${stats.regPlayed || 0}`,
    whiz: `${stats.whizWon || 0}/${stats.whizPlayed || 0}`,
    mirrors: `${stats.mirrorWon || 0}/${stats.mirrorPlayed || 0}`,
    gimmick: `${stats.gimmickWon || 0}/${stats.gimmickPlayed || 0}`
  };

  // Calculate special rules breakdown
  const specialRules = {
    screamer: `${stats.screamerWon || 0}/${stats.screamerPlayed || 0}`,
    assassin: `${stats.assassinWon || 0}/${stats.assassinPlayed || 0}`
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" style={{ padding: isPortrait ? '8px' : `${16 * paddingScale}px` }}>
      <div className="bg-slate-800 rounded-lg max-w-6xl w-full overflow-y-auto" style={{ maxHeight: isPortrait ? 'calc(100vh - 16px)' : '90vh' }}>
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-600" style={{ paddingTop: `${8 * paddingScale}px`, paddingBottom: `${8 * paddingScale}px`, paddingLeft: `${16 * paddingScale}px`, paddingRight: `${16 * paddingScale}px` }}>
          {!isPortrait && <h2 className="font-bold text-white" style={{ fontSize: `${24 * textScale}px` }}>Player Stats</h2>}
          {isPortrait && <div></div>}
          
          {/* Radio buttons and close button */}
          <div className="flex items-center" style={{ gap: `${16 * paddingScale}px` }}>
            <div className="flex items-center" style={{ gap: `${10 * paddingScale}px` }}>
              <label className="flex items-center" style={{ gap: `${6 * paddingScale}px` }}>
                <input
                  type="radio"
                  name="mode"
                  value="all"
                  checked={mode === 'all'}
                  onChange={(e) => setMode(e.target.value as "all" | "partners" | "solo")}
                  className="text-blue-600"
                  style={{ width: `${20 * iconScale}px`, height: `${20 * iconScale}px` }}
                />
                <span className="text-white" style={{ fontSize: `${18 * textScale}px` }}>ALL</span>
              </label>
              <label className="flex items-center" style={{ gap: `${6 * paddingScale}px` }}>
                <input
                  type="radio"
                  name="mode"
                  value="partners"
                  checked={mode === 'partners'}
                  onChange={(e) => setMode(e.target.value as "all" | "partners" | "solo")}
                  className="text-blue-600"
                  style={{ width: `${20 * iconScale}px`, height: `${20 * iconScale}px` }}
                />
                <span className="text-white" style={{ fontSize: `${18 * textScale}px` }}>PARTNERS</span>
              </label>
              <label className="flex items-center" style={{ gap: `${6 * paddingScale}px` }}>
                <input
                  type="radio"
                  name="mode"
                  value="solo"
                  checked={mode === 'solo'}
                  onChange={(e) => setMode(e.target.value as "all" | "partners" | "solo")}
                  className="text-blue-600"
                  style={{ width: `${20 * iconScale}px`, height: `${20 * iconScale}px` }}
                />
                <span className="text-white" style={{ fontSize: `${18 * textScale}px` }}>SOLO</span>
              </label>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-300"
              style={{ fontSize: `${24 * textScale}px` }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Content - Different layouts for portrait and landscape */}
        {isPortrait ? (
          <div className="flex flex-col" style={{ gap: `${12 * paddingScale}px`, padding: `${12 * paddingScale}px` }}>
            {/* 1. Main - Player Profile Card */}
            <div className="bg-slate-700 rounded-lg" style={{ padding: `${12 * paddingScale}px` }}>
              <div className="flex items-center mb-4" style={{ gap: `${16 * paddingScale}px` }}>
                <img src={player.avatar || player.avatarUrl || '/default-avatar.png'} alt={player.username} className="rounded-full" style={{ width: `${64 * iconScale}px`, height: `${64 * iconScale}px` }} />
                <h3 className="font-bold text-white" style={{ fontSize: `${18 * textScale}px` }}>{player.type === 'bot' ? abbreviateBotName(player.username) : player.username}</h3>
              </div>
              <div style={{ gap: `${16 * paddingScale}px`, display: 'flex', flexDirection: 'column' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center" style={{ gap: `${8 * paddingScale}px` }}>
                    <span className="text-yellow-400" style={{ fontSize: `${24 * textScale}px` }}>⭐</span>
                    <span className="font-bold text-yellow-400" style={{ fontSize: `${24 * textScale}px` }}>{Math.round((stats.gamesWon / stats.gamesPlayed) * 100)}% Win</span>
                  </div>
                  <div className="flex items-center" style={{ gap: `${8 * paddingScale}px` }}>
                    <svg className="text-yellow-500" fill="currentColor" viewBox="0 0 20 20" style={{ width: `${24 * iconScale}px`, height: `${24 * iconScale}px` }}>
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                    <span className="font-bold text-yellow-400" style={{ fontSize: `${24 * textScale}px` }}>{Number(displayCoins).toLocaleString()}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2" style={{ gap: `${16 * paddingScale}px` }}>
                  <div className="flex items-center" style={{ gap: `${8 * paddingScale}px` }}>
                    <span className="text-blue-400" style={{ fontSize: `${20 * textScale}px` }}>🏁</span>
                    <span className="text-blue-400" style={{ fontSize: `${20 * textScale}px` }}>{stats.gamesPlayed} Played</span>
                  </div>
                  <div className="flex items-center" style={{ gap: `${8 * paddingScale}px` }}>
                    <span className="text-purple-400" style={{ fontSize: `${20 * textScale}px` }}>🏆</span>
                    <span className="text-purple-400" style={{ fontSize: `${20 * textScale}px` }}>{stats.gamesWon} Won</span>
                  </div>
                  <div className="flex items-center" style={{ gap: `${8 * paddingScale}px` }}>
                    <span className="text-green-400" style={{ fontSize: `${20 * textScale}px` }}>🎒</span>
                    <span className="text-green-400" style={{ fontSize: `${20 * textScale}px` }}>{stats.totalBags} Bags</span>
                  </div>
                  <div className="flex items-center" style={{ gap: `${8 * paddingScale}px` }}>
                    <span className="text-orange-400" style={{ fontSize: `${20 * textScale}px` }}>✅</span>
                    <span className="text-orange-400" style={{ fontSize: `${20 * textScale}px` }}>{(stats.bagsPerGame || 0).toFixed(1)} Bags/G</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Game Mode Breakdown */}
            <div className="bg-slate-700 rounded-lg" style={{ padding: `${12 * paddingScale}px` }}>
              <h3 className="font-bold text-white mb-4" style={{ fontSize: `${18 * textScale}px` }}>Game Mode Breakdown</h3>
              <div className="text-slate-300 text-right mb-6" style={{ fontSize: `${18 * textScale}px` }}>
                <span style={{ marginRight: `${16 * paddingScale}px` }}>(won/played)</span>
                <span>(win %)</span>
              </div>
              <div style={{ gap: `${24 * paddingScale}px`, display: 'flex', flexDirection: 'column' }}>
                <div className="flex justify-between items-center">
                  <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>Regular</span>
                  <div className="flex" style={{ gap: `${32 * paddingScale}px` }}>
                    <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>{gameModeBreakdown.regular}</span>
                    <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>{stats.regPlayed ? Math.round(((stats.regWon || 0) / stats.regPlayed) * 100) : 0}%</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>Whiz</span>
                  <div className="flex" style={{ gap: `${32 * paddingScale}px` }}>
                    <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>{gameModeBreakdown.whiz}</span>
                    <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>{stats.whizPlayed ? Math.round(((stats.whizWon || 0) / stats.whizPlayed) * 100) : 0}%</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>Mirrors</span>
                  <div className="flex" style={{ gap: `${32 * paddingScale}px` }}>
                    <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>{gameModeBreakdown.mirrors}</span>
                    <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>{stats.mirrorPlayed ? Math.round(((stats.mirrorWon || 0) / stats.mirrorPlayed) * 100) : 0}%</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>Gimmick</span>
                  <div className="flex" style={{ gap: `${32 * paddingScale}px` }}>
                    <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>{gameModeBreakdown.gimmick}</span>
                    <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>{stats.gimmickPlayed ? Math.round(((stats.gimmickWon || 0) / stats.gimmickPlayed) * 100) : 0}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Special Rules */}
            <div className="bg-slate-700 rounded-lg" style={{ padding: `${12 * paddingScale}px` }}>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-white" style={{ fontSize: `${20 * textScale}px` }}>Special Rules</h3>
                <div className="text-slate-300 text-right" style={{ fontSize: `${18 * textScale}px` }}>
                  <span style={{ marginRight: `${16 * paddingScale}px` }}>(won/played)</span>
                  <span>(win %)</span>
                </div>
              </div>
              <div style={{ gap: `${12 * paddingScale}px`, display: 'flex', flexDirection: 'column' }}>
                <div className="flex justify-between items-center">
                  <span className="text-white" style={{ fontSize: `${18 * textScale}px` }}>Screamer</span>
                  <div className="flex" style={{ gap: `${32 * paddingScale}px` }}>
                    <span className="text-white" style={{ fontSize: `${18 * textScale}px` }}>{specialRules.screamer}</span>
                    <span className="text-white" style={{ fontSize: `${18 * textScale}px` }}>{stats.screamerPlayed ? Math.round(((stats.screamerWon || 0) / stats.screamerPlayed) * 100) : 0}%</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white" style={{ fontSize: `${18 * textScale}px` }}>Assassin</span>
                  <div className="flex" style={{ gap: `${32 * paddingScale}px` }}>
                    <span className="text-white" style={{ fontSize: `${18 * textScale}px` }}>{specialRules.assassin}</span>
                    <span className="text-white" style={{ fontSize: `${18 * textScale}px` }}>{stats.assassinPlayed ? Math.round(((stats.assassinWon || 0) / stats.assassinPlayed) * 100) : 0}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Nil Stats */}
            <div className="bg-slate-700 rounded-lg" style={{ padding: `${12 * paddingScale}px` }}>
              <h3 className="font-bold text-white mb-4" style={{ fontSize: `${24 * textScale}px` }}>Nil Stats</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-white">
                  <thead>
                    <tr className="border-b border-slate-500">
                      <th className="text-left" style={{ padding: `${8 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>Type</th>
                      <th className="text-center" style={{ padding: `${8 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>Bid</th>
                      <th className="text-center" style={{ padding: `${8 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>Made</th>
                      <th className="text-center" style={{ padding: `${8 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>%</th>
                      <th className="text-center" style={{ padding: `${8 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-600">
                      <td style={{ padding: `${12 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>Nil</td>
                      <td className="text-center" style={{ padding: `${12 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>{stats.nilsBid}</td>
                      <td className="text-center" style={{ padding: `${12 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>{stats.nilsMade}</td>
                      <td className="text-center" style={{ padding: `${12 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>
                        {stats.nilsBid > 0 ? Math.round((stats.nilsMade / stats.nilsBid) * 100) : 0}%
                      </td>
                      <td className="text-center" style={{ padding: `${12 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>
                        {formatSigned((stats.nilsMade * 100) + ((stats.nilsBid - stats.nilsMade) * -100))}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: `${12 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>Blind Nil</td>
                      <td className="text-center" style={{ padding: `${12 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>{stats.blindNilsBid}</td>
                      <td className="text-center" style={{ padding: `${12 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>{stats.blindNilsMade}</td>
                      <td className="text-center" style={{ padding: `${12 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>
                        {stats.blindNilsBid > 0 ? Math.round((stats.blindNilsMade / stats.blindNilsBid) * 100) : 0}%
                      </td>
                      <td className="text-center" style={{ padding: `${12 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>
                        {formatSigned((stats.blindNilsMade * 200) + ((stats.blindNilsBid - stats.blindNilsMade) * -200))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2" style={{ gap: `${24 * paddingScale}px`, padding: `${24 * paddingScale}px` }}>
            {/* Left Column */}
            <div className="flex flex-col">
              {/* Player Profile Card */}
              <div className="bg-slate-700 rounded-lg mb-6" style={{ padding: `${24 * paddingScale}px` }}>
                <div className="flex items-center mb-4" style={{ gap: `${16 * paddingScale}px` }}>
                  <img src={player.avatar || player.avatarUrl || '/default-avatar.png'} alt={player.username} className="rounded-full" style={{ width: `${64 * iconScale}px`, height: `${64 * iconScale}px` }} />
                  <h3 className="font-bold text-white" style={{ fontSize: `${isSmallScreen ? 20 : (isMediumScreen ? 22 : (isLargeScreen ? 24 : (isExtraLargeScreen ? 23 : (isLargerScreen ? 27 : (isEvenLargerScreen ? 28 : 30)))))}px` }}>{player.type === 'bot' ? abbreviateBotName(player.username) : player.username}</h3>
                </div>
                <div style={{ gap: `${16 * paddingScale}px`, display: 'flex', flexDirection: 'column' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center" style={{ gap: `${8 * paddingScale}px` }}>
                      <span className="text-yellow-400" style={{ fontSize: `${24 * textScale}px` }}>⭐</span>
                      <span className="font-bold text-yellow-400" style={{ fontSize: `${24 * textScale}px` }}>{Math.round((stats.gamesWon / stats.gamesPlayed) * 100)}% Win</span>
                    </div>
                    <div className="flex items-center" style={{ gap: `${8 * paddingScale}px` }}>
                      <svg className="text-yellow-500" fill="currentColor" viewBox="0 0 20 20" style={{ width: `${24 * iconScale}px`, height: `${24 * iconScale}px` }}>
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
                      </svg>
                      <span className="font-bold text-yellow-400" style={{ fontSize: `${24 * textScale}px` }}>{Number(displayCoins).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2" style={{ gap: `${16 * paddingScale}px` }}>
                    <div className="flex items-center" style={{ gap: `${8 * paddingScale}px` }}>
                      <span className="text-blue-400" style={{ fontSize: `${20 * textScale}px` }}>🏁</span>
                      <span className="text-blue-400" style={{ fontSize: `${20 * textScale}px` }}>{stats.gamesPlayed} Played</span>
                    </div>
                    <div className="flex items-center" style={{ gap: `${8 * paddingScale}px` }}>
                      <span className="text-purple-400" style={{ fontSize: `${20 * textScale}px` }}>🏆</span>
                      <span className="text-purple-400" style={{ fontSize: `${20 * textScale}px` }}>{stats.gamesWon} Won</span>
                    </div>
                    <div className="flex items-center" style={{ gap: `${8 * paddingScale}px` }}>
                      <span className="text-green-400" style={{ fontSize: `${20 * textScale}px` }}>🎒</span>
                      <span className="text-green-400" style={{ fontSize: `${20 * textScale}px` }}>{stats.totalBags} Bags</span>
                    </div>
                    <div className="flex items-center" style={{ gap: `${8 * paddingScale}px` }}>
                      <span className="text-orange-400" style={{ fontSize: `${20 * textScale}px` }}>✅</span>
                      <span className="text-orange-400" style={{ fontSize: `${20 * textScale}px` }}>{(stats.bagsPerGame || 0).toFixed(1)} Bags/G</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Nil Stats */}
              <div className="bg-slate-700 rounded-lg flex-1" style={{ padding: `${24 * paddingScale}px` }}>
                <h3 className="font-bold text-white mb-4" style={{ fontSize: `${24 * textScale}px` }}>Nil Stats</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-white">
                    <thead>
                      <tr className="border-b border-slate-500">
                        <th className="text-left" style={{ padding: `${8 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>Type</th>
                        <th className="text-center" style={{ padding: `${8 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>Bid</th>
                        <th className="text-center" style={{ padding: `${8 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>Made</th>
                        <th className="text-center" style={{ padding: `${8 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>%</th>
                        <th className="text-center" style={{ padding: `${8 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-600">
                        <td style={{ padding: `${12 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>Nil</td>
                        <td className="text-center" style={{ padding: `${12 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>{stats.nilsBid}</td>
                        <td className="text-center" style={{ padding: `${12 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>{stats.nilsMade}</td>
                        <td className="text-center" style={{ padding: `${12 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>
                          {stats.nilsBid > 0 ? Math.round((stats.nilsMade / stats.nilsBid) * 100) : 0}%
                        </td>
                        <td className="text-center" style={{ padding: `${12 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>
                          {formatSigned((stats.nilsMade * 100) + ((stats.nilsBid - stats.nilsMade) * -100))}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: `${12 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>Blind Nil</td>
                        <td className="text-center" style={{ padding: `${12 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>{stats.blindNilsBid}</td>
                        <td className="text-center" style={{ padding: `${12 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>{stats.blindNilsMade}</td>
                        <td className="text-center" style={{ padding: `${12 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>
                          {stats.blindNilsBid > 0 ? Math.round((stats.blindNilsMade / stats.blindNilsBid) * 100) : 0}%
                        </td>
                        <td className="text-center" style={{ padding: `${12 * paddingScale}px 0`, fontSize: `${18 * textScale}px` }}>
                          {formatSigned((stats.blindNilsMade * 200) + ((stats.blindNilsBid - stats.blindNilsMade) * -200))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="flex flex-col">
              {/* Game Mode Breakdown */}
              <div className="bg-slate-700 rounded-lg mb-6 flex-1" style={{ padding: `${24 * paddingScale}px` }}>
                <h3 className="font-bold text-white mb-4" style={{ fontSize: `${isSmallScreen ? 20 : (isMediumScreen ? 22 : (isLargeScreen ? 24 : (isExtraLargeScreen ? 23 : (isLargerScreen ? 27 : (isEvenLargerScreen ? 28 : 30)))))}px` }}>Game Mode Breakdown</h3>
                <div className="text-slate-300 text-right mb-6" style={{ fontSize: `${18 * textScale}px` }}>
                  <span style={{ marginRight: `${16 * paddingScale}px` }}>(won/played)</span>
                  <span>(win %)</span>
                </div>
                <div style={{ gap: `${24 * paddingScale}px`, display: 'flex', flexDirection: 'column' }}>
                  <div className="flex justify-between items-center">
                    <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>Regular</span>
                    <div className="flex" style={{ gap: `${32 * paddingScale}px` }}>
                      <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>{gameModeBreakdown.regular}</span>
                      <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>{stats.regPlayed ? Math.round(((stats.regWon || 0) / stats.regPlayed) * 100) : 0}%</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>Whiz</span>
                    <div className="flex" style={{ gap: `${32 * paddingScale}px` }}>
                      <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>{gameModeBreakdown.whiz}</span>
                      <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>{stats.whizPlayed ? Math.round(((stats.whizWon || 0) / stats.whizPlayed) * 100) : 0}%</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>Mirrors</span>
                    <div className="flex" style={{ gap: `${32 * paddingScale}px` }}>
                      <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>{gameModeBreakdown.mirrors}</span>
                      <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>{stats.mirrorPlayed ? Math.round(((stats.mirrorWon || 0) / stats.mirrorPlayed) * 100) : 0}%</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>Gimmick</span>
                    <div className="flex" style={{ gap: `${32 * paddingScale}px` }}>
                      <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>{gameModeBreakdown.gimmick}</span>
                      <span className="text-white" style={{ fontSize: `${20 * textScale}px` }}>{stats.gimmickPlayed ? Math.round(((stats.gimmickWon || 0) / stats.gimmickPlayed) * 100) : 0}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Special Rules */}
              <div className="bg-slate-700 rounded-lg" style={{ padding: `${16 * paddingScale}px` }}>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-white" style={{ fontSize: `${20 * textScale}px` }}>Special Rules</h3>
                  <div className="text-slate-300 text-right" style={{ fontSize: `${18 * textScale}px` }}>
                    <span style={{ marginRight: `${16 * paddingScale}px` }}>(won/played)</span>
                    <span>(win %)</span>
                  </div>
                </div>
                <div style={{ gap: `${12 * paddingScale}px`, display: 'flex', flexDirection: 'column' }}>
                  <div className="flex justify-between items-center">
                    <span className="text-white" style={{ fontSize: `${18 * textScale}px` }}>Screamer</span>
                    <div className="flex" style={{ gap: `${32 * paddingScale}px` }}>
                      <span className="text-white" style={{ fontSize: `${18 * textScale}px` }}>{specialRules.screamer}</span>
                      <span className="text-white" style={{ fontSize: `${18 * textScale}px` }}>{stats.screamerPlayed ? Math.round(((stats.screamerWon || 0) / stats.screamerPlayed) * 100) : 0}%</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white" style={{ fontSize: `${18 * textScale}px` }}>Assassin</span>
                    <div className="flex" style={{ gap: `${32 * paddingScale}px` }}>
                      <span className="text-white" style={{ fontSize: `${18 * textScale}px` }}>{specialRules.assassin}</span>
                      <span className="text-white" style={{ fontSize: `${18 * textScale}px` }}>{stats.assassinPlayed ? Math.round(((stats.assassinWon || 0) / stats.assassinPlayed) * 100) : 0}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlayerStatsModal; 