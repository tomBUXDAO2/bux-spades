import React, { useState, useEffect } from 'react';
import { useAuth } from '@/features/auth/AuthContext';

interface Game {
  id: string;
  status: 'WAITING' | 'BIDDING' | 'PLAYING';
  createdAt: string;
  updatedAt: string;
  settings: any;
  currentPlayer?: string;
  currentTrick?: number;
  currentRound?: number;
  players: Array<{
    seatIndex: number;
    userId: string;
    user: {
      id: string;
      username: string;
      discordId: string;
      avatar?: string;
    };
    isReady: boolean;
    type: string;
  }>;
}

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'games' | 'tournaments' | 'events'>('games');
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGames, setSelectedGames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  
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
  const textScale = isSmallScreen ? 0.7 : (isMediumScreen ? 0.85 : (isLargeScreen ? 0.95 : (isExtraLargeScreen ? 0.98 : 1)));
  const iconScale = isSmallScreen ? 0.7 : (isMediumScreen ? 0.85 : (isLargeScreen ? 0.95 : (isExtraLargeScreen ? 0.98 : 1)));
  const paddingScale = isSmallScreen ? 0.6 : (isMediumScreen ? 0.7 : (isLargeScreen ? 0.85 : (isExtraLargeScreen ? 0.9 : 1)));

  // Fetch games when panel opens
  useEffect(() => {
    if (isOpen && activeTab === 'games') {
      fetchGames();
    }
  }, [isOpen, activeTab]);

  const fetchGames = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('sessionToken');
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/api/admin/games`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch games');
      }

      const data = await response.json();
      setGames(data.games || []);
    } catch (err) {
      console.error('Error fetching games:', err);
      setError('Failed to load games');
    } finally {
      setLoading(false);
    }
  };

  const handleGameSelect = (gameId: string) => {
    const newSelected = new Set(selectedGames);
    if (newSelected.has(gameId)) {
      newSelected.delete(gameId);
    } else {
      newSelected.add(gameId);
    }
    setSelectedGames(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedGames.size === games.length) {
      setSelectedGames(new Set());
    } else {
      setSelectedGames(new Set(games.map(game => game.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedGames.size === 0) return;

    if (!confirm(`Are you sure you want to delete ${selectedGames.size} game(s)? This action cannot be undone.`)) {
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('sessionToken');
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/admin/games`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ gameIds: Array.from(selectedGames) }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete games');
      }

      const data = await response.json();
      console.log('Deleted games:', data);
      
      // Refresh games list
      await fetchGames();
      setSelectedGames(new Set());
    } catch (err) {
      console.error('Error deleting games:', err);
      setError('Failed to delete games');
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePlayer = async (gameId: string, userId: string, username: string) => {
    if (!confirm(`Are you sure you want to remove ${username} from this game?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('sessionToken');
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/admin/games/${gameId}/players/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to remove player');
      }

      // Refresh games list
      await fetchGames();
    } catch (err) {
      console.error('Error removing player:', err);
      setError('Failed to remove player');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'WAITING': return 'text-yellow-400';
      case 'BIDDING': return 'text-blue-400';
      case 'PLAYING': return 'text-green-400';
      default: return 'text-gray-400';
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-[9998]"
        onClick={onClose}
      />

      {/* Admin Panel */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ padding: isPortrait ? '8px' : `${16 * paddingScale}px` }}>
        <div 
          className="bg-slate-900 rounded-lg shadow-2xl border border-red-500/50 w-full max-w-4xl overflow-hidden"
          style={{ maxHeight: isPortrait ? 'calc(100vh - 16px)' : '90vh' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-red-600 to-red-700 flex items-center justify-between" style={{ paddingTop: `${8 * paddingScale}px`, paddingBottom: `${8 * paddingScale}px`, paddingLeft: isPortrait ? `${12 * paddingScale}px` : `${24 * paddingScale}px`, paddingRight: isPortrait ? `${12 * paddingScale}px` : `${24 * paddingScale}px` }}>
            <div className="flex items-center" style={{ gap: `${12 * paddingScale}px` }}>
              <span style={{ fontSize: `${24 * textScale}px` }}>⚠️</span>
              <h2 className="font-bold text-white" style={{ fontSize: `${20 * textScale}px` }}>ADMIN PANEL</h2>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 leading-none"
              style={{ fontSize: `${24 * textScale}px` }}
            >
              ×
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-700">
            <button
              onClick={() => setActiveTab('games')}
              className={`flex-1 font-medium transition-colors ${
                activeTab === 'games'
                  ? 'bg-slate-800 text-white border-b-2 border-red-500'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
              style={{ padding: isPortrait ? `${8 * paddingScale}px 12px` : `${12 * paddingScale}px ${24 * paddingScale}px`, fontSize: isPortrait ? `${12 * textScale}px` : `${14 * textScale}px` }}
            >
              🎮 Manage Games
            </button>
            <button
              onClick={() => setActiveTab('tournaments')}
              className={`flex-1 font-medium transition-colors ${
                activeTab === 'tournaments'
                  ? 'bg-slate-800 text-white border-b-2 border-red-500'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
              style={{ padding: isPortrait ? `${8 * paddingScale}px 12px` : `${12 * paddingScale}px ${24 * paddingScale}px`, fontSize: isPortrait ? `${12 * textScale}px` : `${14 * textScale}px` }}
            >
              🏆 Tournaments
            </button>
            <button
              onClick={() => setActiveTab('events')}
              className={`flex-1 font-medium transition-colors ${
                activeTab === 'events'
                  ? 'bg-slate-800 text-white border-b-2 border-red-500'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
              style={{ padding: isPortrait ? `${8 * paddingScale}px 12px` : `${12 * paddingScale}px ${24 * paddingScale}px`, fontSize: isPortrait ? `${12 * textScale}px` : `${14 * textScale}px` }}
            >
              📅 Daily Events
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(90vh-140px)]" style={{ padding: isPortrait ? `${12 * paddingScale}px` : `${24 * paddingScale}px` }}>
            {activeTab === 'games' && (
              <div>
                <div className={isPortrait ? "flex flex-col mb-4" : "flex justify-between items-center mb-4"} style={{ gap: isPortrait ? `${12 * paddingScale}px` : '0' }}>
                  <div>
                    <h3 className="font-semibold text-white" style={{ fontSize: `${18 * textScale}px` }}>Manage Stuck Games</h3>
                    <p className="text-slate-400" style={{ fontSize: `${14 * textScale}px` }}>
                      View and delete games that are stuck or need manual intervention.
                    </p>
                  </div>
                  <div className="flex" style={{ gap: `${8 * paddingScale}px` }}>
                    <button
                      onClick={fetchGames}
                      disabled={loading}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-white flex items-center justify-center"
                      style={{ padding: `${4 * paddingScale}px ${12 * paddingScale}px`, fontSize: `${14 * textScale}px` }}
                    >
                      {loading ? 'Loading...' : 'Refresh'}
                    </button>
                    <button
                      onClick={handleSelectAll}
                      className="bg-gray-600 hover:bg-gray-700 rounded text-white flex items-center justify-center"
                      style={{ padding: `${4 * paddingScale}px ${12 * paddingScale}px`, fontSize: `${14 * textScale}px` }}
                    >
                      {selectedGames.size === games.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <button
                      onClick={handleDeleteSelected}
                      disabled={selectedGames.size === 0 || loading}
                      className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-white flex items-center justify-center"
                      style={{ padding: `${4 * paddingScale}px ${12 * paddingScale}px`, fontSize: `${14 * textScale}px` }}
                    >
                      Delete Selected ({selectedGames.size})
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="mb-4 bg-red-900 border border-red-700 rounded text-red-200" style={{ padding: `${12 * paddingScale}px`, fontSize: `${14 * textScale}px` }}>
                    {error}
                  </div>
                )}

                <div className="bg-slate-800 rounded-lg border border-slate-700 max-h-96 overflow-y-auto">
                  {games.length === 0 ? (
                    <div className="text-center text-slate-400" style={{ padding: `${32 * paddingScale}px`, fontSize: `${14 * textScale}px` }}>
                      {loading ? 'Loading games...' : 'No active games found'}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-700">
                      {games.map((game) => (
                        <div
                          key={game.id}
                          className={`hover:bg-slate-700/50 cursor-pointer transition-colors ${
                            selectedGames.has(game.id) ? 'bg-red-900/20 border-l-4 border-red-500' : ''
                          }`}
                          style={{ padding: `${16 * paddingScale}px` }}
                          onClick={() => handleGameSelect(game.id)}
                        >
                          <div className="flex items-start" style={{ gap: `${12 * paddingScale}px` }}>
                            <input
                              type="checkbox"
                              checked={selectedGames.has(game.id)}
                              onChange={() => handleGameSelect(game.id)}
                              className="mt-1 text-red-600 bg-slate-700 border-slate-600 rounded focus:ring-red-500"
                              style={{ width: `${16 * iconScale}px`, height: `${16 * iconScale}px` }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center mb-2" style={{ gap: `${12 * paddingScale}px` }}>
                                <span className="font-mono text-slate-400" style={{ fontSize: `${14 * textScale}px` }}>
                                  {game.id}
                                </span>
                                <span className={`rounded font-semibold ${getStatusColor(game.status)} bg-slate-700`} style={{ padding: `${4 * paddingScale}px ${8 * paddingScale}px`, fontSize: `${12 * textScale}px` }}>
                                  {game.status}
                                </span>
                                <span className="text-slate-400" style={{ fontSize: `${12 * textScale}px` }}>
                                  {formatDate(game.createdAt)}
                                </span>
                              </div>
                              
                              <div className="text-slate-300 mb-2" style={{ fontSize: `${14 * textScale}px` }}>
                                <div>Players: {game.players.length}/4</div>
                                {game.currentPlayer && <div>Current Player: {game.currentPlayer}</div>}
                                {game.currentTrick && <div>Current Trick: {game.currentTrick}</div>}
                                {game.currentRound && <div>Current Round: {game.currentRound}</div>}
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: `${8 * paddingScale}px` }}>
                                {game.players.map((player, index) => (
                                  <div key={player.seatIndex} className="flex items-center bg-slate-700 rounded" style={{ gap: `${8 * paddingScale}px`, padding: `${8 * paddingScale}px` }}>
                                    <span className="text-slate-400" style={{ fontSize: `${12 * textScale}px` }}>Seat {player.seatIndex}:</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium truncate text-white" style={{ fontSize: `${14 * textScale}px` }}>
                                        {player.user.username}
                                      </div>
                                      <div className="text-slate-400" style={{ fontSize: `${12 * textScale}px` }}>
                                        {player.type} • {player.isReady ? 'Ready' : 'Not Ready'}
                                      </div>
                                    </div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemovePlayer(game.id, player.userId, player.user.username);
                                      }}
                                      className="text-red-400 hover:text-red-300"
                                      style={{ fontSize: `${12 * textScale}px`, padding: `${0}px ${4 * paddingScale}px` }}
                                      title="Remove player"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                                {Array.from({ length: 4 - game.players.length }).map((_, index) => (
                                  <div key={`empty-${index}`} className="flex items-center bg-slate-700 rounded opacity-50" style={{ gap: `${8 * paddingScale}px`, padding: `${8 * paddingScale}px` }}>
                                    <span className="text-slate-400" style={{ fontSize: `${12 * textScale}px` }}>Seat {game.players.length + index}:</span>
                                    <div className="text-slate-500" style={{ fontSize: `${14 * textScale}px` }}>Empty</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'tournaments' && (
              <div>
                <h3 className="font-semibold text-white mb-4" style={{ fontSize: `${18 * textScale}px` }}>Create Tournament</h3>
                <p className="text-slate-400 mb-4" style={{ fontSize: `${14 * textScale}px` }}>
                  Set up a new tournament with custom rules and prizes.
                </p>
                {/* Tournament creation form will go here */}
                <div className="bg-slate-800 rounded-lg text-center text-slate-400" style={{ padding: `${16 * paddingScale}px`, fontSize: `${14 * textScale}px` }}>
                  Tournament creation coming soon...
                </div>
              </div>
            )}

            {activeTab === 'events' && (
              <div>
                <h3 className="font-semibold text-white mb-4" style={{ fontSize: `${18 * textScale}px` }}>Create Daily Event</h3>
                <p className="text-slate-400 mb-4" style={{ fontSize: `${14 * textScale}px` }}>
                  Schedule special events with unique game modes and rewards.
                </p>
                {/* Event creation form will go here */}
                <div className="bg-slate-800 rounded-lg text-center text-slate-400" style={{ padding: `${16 * paddingScale}px`, fontSize: `${14 * textScale}px` }}>
                  Event creation coming soon...
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminPanel;

