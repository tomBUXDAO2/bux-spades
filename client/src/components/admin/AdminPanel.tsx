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
      console.log('[ADMIN PANEL] Fetching games from:', apiUrl);
      console.log('[ADMIN PANEL] VITE_API_URL env var:', import.meta.env.VITE_API_URL);
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
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div 
          className="bg-slate-900 rounded-lg shadow-2xl border border-red-500/50 w-full max-w-4xl max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">⚠️</span>
              <h2 className="text-xl font-bold text-white">ADMIN PANEL</h2>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 text-2xl leading-none"
            >
              ×
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-700">
            <button
              onClick={() => setActiveTab('games')}
              className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'games'
                  ? 'bg-slate-800 text-white border-b-2 border-red-500'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              🎮 Manage Games
            </button>
            <button
              onClick={() => setActiveTab('tournaments')}
              className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'tournaments'
                  ? 'bg-slate-800 text-white border-b-2 border-red-500'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              🏆 Tournaments
            </button>
            <button
              onClick={() => setActiveTab('events')}
              className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'events'
                  ? 'bg-slate-800 text-white border-b-2 border-red-500'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              📅 Daily Events
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
            {activeTab === 'games' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Manage Stuck Games</h3>
                    <p className="text-slate-400 text-sm">
                      View and delete games that are stuck or need manual intervention.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={fetchGames}
                      disabled={loading}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-sm text-white"
                    >
                      {loading ? 'Loading...' : 'Refresh'}
                    </button>
                    <button
                      onClick={handleSelectAll}
                      className="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm text-white"
                    >
                      {selectedGames.size === games.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <button
                      onClick={handleDeleteSelected}
                      disabled={selectedGames.size === 0 || loading}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm text-white"
                    >
                      Delete Selected ({selectedGames.size})
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-900 border border-red-700 rounded text-red-200 text-sm">
                    {error}
                  </div>
                )}

                <div className="bg-slate-800 rounded-lg border border-slate-700 max-h-96 overflow-y-auto">
                  {games.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
                      {loading ? 'Loading games...' : 'No active games found'}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-700">
                      {games.map((game) => (
                        <div
                          key={game.id}
                          className={`p-4 hover:bg-slate-700/50 cursor-pointer transition-colors ${
                            selectedGames.has(game.id) ? 'bg-red-900/20 border-l-4 border-red-500' : ''
                          }`}
                          onClick={() => handleGameSelect(game.id)}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selectedGames.has(game.id)}
                              onChange={() => handleGameSelect(game.id)}
                              className="mt-1 w-4 h-4 text-red-600 bg-slate-700 border-slate-600 rounded focus:ring-red-500"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2">
                                <span className="font-mono text-sm text-slate-400">
                                  {game.id}
                                </span>
                                <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(game.status)} bg-slate-700`}>
                                  {game.status}
                                </span>
                                <span className="text-xs text-slate-400">
                                  {formatDate(game.createdAt)}
                                </span>
                              </div>
                              
                              <div className="text-sm text-slate-300 mb-2">
                                <div>Players: {game.players.length}/4</div>
                                {game.currentPlayer && <div>Current Player: {game.currentPlayer}</div>}
                                {game.currentTrick && <div>Current Trick: {game.currentTrick}</div>}
                                {game.currentRound && <div>Current Round: {game.currentRound}</div>}
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {game.players.map((player, index) => (
                                  <div key={player.seatIndex} className="flex items-center gap-2 p-2 bg-slate-700 rounded">
                                    <span className="text-xs text-slate-400">Seat {player.seatIndex}:</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium truncate text-white">
                                        {player.user.username}
                                      </div>
                                      <div className="text-xs text-slate-400">
                                        {player.type} • {player.isReady ? 'Ready' : 'Not Ready'}
                                      </div>
                                    </div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemovePlayer(game.id, player.userId, player.user.username);
                                      }}
                                      className="text-red-400 hover:text-red-300 text-xs px-1"
                                      title="Remove player"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                                {Array.from({ length: 4 - game.players.length }).map((_, index) => (
                                  <div key={`empty-${index}`} className="flex items-center gap-2 p-2 bg-slate-700 rounded opacity-50">
                                    <span className="text-xs text-slate-400">Seat {game.players.length + index}:</span>
                                    <div className="text-sm text-slate-500">Empty</div>
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
                <h3 className="text-lg font-semibold text-white mb-4">Create Tournament</h3>
                <p className="text-slate-400 text-sm mb-4">
                  Set up a new tournament with custom rules and prizes.
                </p>
                {/* Tournament creation form will go here */}
                <div className="bg-slate-800 rounded-lg p-4 text-center text-slate-400">
                  Tournament creation coming soon...
                </div>
              </div>
            )}

            {activeTab === 'events' && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Create Daily Event</h3>
                <p className="text-slate-400 text-sm mb-4">
                  Schedule special events with unique game modes and rewards.
                </p>
                {/* Event creation form will go here */}
                <div className="bg-slate-800 rounded-lg p-4 text-center text-slate-400">
                  Event creation coming soon...
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-slate-800 px-6 py-3 border-t border-slate-700 flex justify-between items-center">
            <p className="text-xs text-slate-500">
              ⚠️ Admin actions are logged and monitored
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-600 transition-colors text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminPanel;

