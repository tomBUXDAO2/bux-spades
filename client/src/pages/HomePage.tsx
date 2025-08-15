import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import CreateGameModal from '@/components/game/CreateGameModal';
import NewUserWelcomeModal from '@/components/modals/NewUserWelcomeModal';
import Header from '@/components/common/Header';
import PlayerStatsModal from '@/components/modals/PlayerStatsModal';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import type { GameState, Player, Bot } from '../types/game';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { api } from '@/lib/api';

interface ChatMessage {
  id?: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: number;
  isGameMessage?: boolean;
}

// Confirmation modal component
const ConfirmActionModal = ({ open, player, action, onConfirm, onCancel }: any) => {
  if (!open || !player) return null;
  const actionText = action === 'add-friend' ? 'Add Friend' :
                     action === 'remove-friend' ? 'Remove Friend' :
                     action === 'block' ? 'Block' :
                     action === 'unblock' ? 'Unblock' : '';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
      <div className="bg-slate-800 rounded-lg p-6 flex flex-col items-center">
        <img src={player.avatar || '/default-pfp.jpg'} alt={player.username} className="w-16 h-16 rounded-full mb-2" />
        <div className="text-lg text-slate-200 font-bold mb-2">{player.username}</div>
        <div className="text-slate-300 mb-4">Are you sure you want to {actionText.toLowerCase()}?</div>
        <div className="flex gap-4">
          <button className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700" onClick={onConfirm}>Yes</button>
          <button className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700" onClick={onCancel}>No</button>
        </div>
      </div>
    </div>
  );
};

// Add type guards if not present
function isPlayer(p: any): p is Player {
  return p && typeof p === 'object' && ((('type' in p) && p.type !== 'bot') || !('type' in p));
}
function isBot(p: any): p is Bot {
  return p && typeof p === 'object' && 'type' in p && p.type === 'bot';
}

const HomePage: React.FC = () => {
  const { user } = useAuth();
  const { socket, isAuthenticated } = useSocket();
  if (!user) return null;
  const [isCreateGameModalOpen, setIsCreateGameModalOpen] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [games, setGames] = useState<GameState[]>([]);
  const [filter, setFilter] = useState('waiting');
  const [isLoading, setIsLoading] = useState(true);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [activeChatTab, setActiveChatTab] = useState<'chat' | 'players'>('chat');
  const [playerFilter, setPlayerFilter] = useState<'all' | 'friends' | 'hide-blocked'>('all');
  const [onlinePlayers, setOnlinePlayers] = useState<any[]>([]);
  const onlineCount = onlinePlayers.filter(p => p.online).length;
  const [isPlayerStatsOpen, setIsPlayerStatsOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mobileTab, setMobileTab] = useState<'lobby' | 'chat'>('lobby');
  const navigate = useNavigate();
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; player: any; action: string }>({ open: false, player: null, action: '' });
  const onlineIdsRef = useRef<string[]>([]);

  // Check if user is new (has 5M coins and 0 games played)
  useEffect(() => {
    if (
      user &&
      user.coins === 5000000 &&
      user.stats?.gamesPlayed === 0 &&
      !localStorage.getItem('welcomeModalDismissed')
    ) {
      setShowWelcomeModal(true);
    }
  }, [user]);

  // Check for league games when homepage loads
  useEffect(() => {
    if (!user) return;

    const checkForLeagueGames = async () => {
      try {
        console.log('[LEAGUE GAME CHECK] Checking for league games for user:', user.id);
        
        // Get all games from the server
        const response = await api.get('/api/games');
        if (response.ok) {
          const allGames = await response.json();
          console.log('[LEAGUE GAME CHECK] All games:', allGames.map((g: any) => ({ 
            id: g.id, 
            status: g.status, 
            league: g.league,
            players: g.players?.map((p: any) => p ? { id: p.id, username: p.username } : null) || []
          })));
          
          // Find league games where user is assigned
          const userLeagueGame = allGames.find((game: any) => {
            const isLeagueGame = game.league;
            const isUserInGame = game.players?.some((player: any) => player && player.id === user.id);
            const isWaiting = game.status === 'WAITING';
            
            console.log(`[LEAGUE GAME CHECK] Game ${game.id}: isLeagueGame=${isLeagueGame}, isUserInGame=${isUserInGame}, isWaiting=${isWaiting}`);
            
            return isLeagueGame && isUserInGame && isWaiting;
          });
          
          if (userLeagueGame) {
            console.log('[LEAGUE GAME CHECK] Found league game for user, redirecting to table:', userLeagueGame.id);
            console.log('[LEAGUE GAME CHECK] Redirecting now...');
            navigate(`/table/${userLeagueGame.id}`, { replace: true });
          } else {
            console.log('[LEAGUE GAME CHECK] No league game found for user');
            console.log('[LEAGUE GAME CHECK] User will stay in lobby');
          }
        }
      } catch (error) {
        console.error('[LEAGUE GAME CHECK] Error checking for league games:', error);
      }
    };

    checkForLeagueGames();
  }, [user, navigate]);

  // Periodic check for league games (fallback for missed real-time events)
  useEffect(() => {
    if (!user) return;
    
    console.log('[PERIODIC LEAGUE CHECK] Setting up periodic check for user:', user.id);
    
    const checkForLeagueGames = async () => {
      try {
        console.log('[PERIODIC LEAGUE CHECK] Running periodic check...');
        const response = await api.get('/api/games');
        if (response.ok) {
          const allGames = await response.json();
          
          const userLeagueGame = allGames.find((game: any) => {
            const isLeagueGame = game.league;
            const isUserInGame = game.players?.some((player: any) => player && player.id === user.id);
            const isWaiting = game.status === 'WAITING';
            
            console.log(`[PERIODIC LEAGUE CHECK] Game ${game.id}: isLeagueGame=${isLeagueGame}, isUserInGame=${isUserInGame}, isWaiting=${isWaiting}`);
            
            return isLeagueGame && isUserInGame && isWaiting;
          });
          
          if (userLeagueGame) {
            console.log('[PERIODIC LEAGUE CHECK] Found league game for user, redirecting to table:', userLeagueGame.id);
            navigate(`/table/${userLeagueGame.id}`, { replace: true });
          }
        }
      } catch (error) {
        console.error('[PERIODIC LEAGUE CHECK] Error checking for league games:', error);
      }
    };
    
    // Check immediately
    checkForLeagueGames();
    
    // Then check every 15 seconds as a fallback
    const interval = setInterval(checkForLeagueGames, 15000);
    
    return () => {
      console.log('[PERIODIC LEAGUE CHECK] Cleaning up periodic check');
      clearInterval(interval);
    };
  }, [user, navigate]);

  // Socket event handlers
  useEffect(() => {
    if (!socket || !isAuthenticated) {
      console.log('Socket not ready or not authenticated');
      return;
    }

    console.log('Setting up socket event handlers');

    const handleGamesUpdated = (updatedGames: GameState[]) => {
      console.log('Games updated:', updatedGames);
      setGames(updatedGames);
      setIsLoading(false);
    };

    const handleAllGamesUpdated = (allGames: GameState[]) => {
      console.log('All games updated (including league games):', allGames);
      
      // Check if any of the updated games is a league game for this user
      if (user) {
        console.log('[REAL-TIME LEAGUE CHECK] Checking all games for user:', user.id);
        const userLeagueGame = allGames.find((game: any) => {
          const isLeagueGame = game.league;
          const isUserInGame = game.players?.some((player: any) => player && player.id === user.id);
          const isWaiting = game.status === 'WAITING';
          
          console.log(`[REAL-TIME LEAGUE CHECK] Game ${game.id}: isLeagueGame=${isLeagueGame}, isUserInGame=${isUserInGame}, isWaiting=${isWaiting}`);
          
          return isLeagueGame && isUserInGame && isWaiting;
        });
        
        if (userLeagueGame) {
          console.log('[REAL-TIME LEAGUE CHECK] Found new league game for user, redirecting to table:', userLeagueGame.id);
          navigate(`/table/${userLeagueGame.id}`, { replace: true });
        }
      }
    };

    const handleLobbyChatMessage = (msg: ChatMessage) => {
      console.log('Lobby chat message received:', msg);
      setChatMessages(prev => [...prev, msg]);
    };

    const handleOnlineUsers = (onlineUserIds: string[]) => {
      console.log('Online users updated:', onlineUserIds);
      // System join messages for newly online users
      const prevIds = onlineIdsRef.current;
      const newlyOnline = onlineUserIds.filter(id => !prevIds.includes(id));
      if (newlyOnline.length > 0) {
        setChatMessages(prev => [
          ...prev,
          ...newlyOnline.map(id => {
            const player = onlinePlayers.find(p => p.id === id);
            const name = player?.username || player?.name || 'Someone';
            return {
              id: `system-${Date.now()}-${id}`,
              userId: 'system',
              userName: 'System',
              message: `${name} joined the lobby`,
              timestamp: Date.now()
            } as ChatMessage;
          })
        ]);
      }
      onlineIdsRef.current = onlineUserIds;
      setOnlinePlayers(prev => prev.map(player => ({
        ...player,
        online: onlineUserIds.includes(player.id)
      })));
    };

    const handleFriendAdded = () => {
      console.log('Friend added, refreshing player list');
      api.get('/api/users')
        .then(res => res.json())
        .then(setOnlinePlayers)
        .catch(err => console.error('Failed to refresh player list:', err));
    };

    // Add event listeners
    socket.on('games_updated', handleGamesUpdated);
    socket.on('all_games_updated', handleAllGamesUpdated);
    socket.on('lobby_chat_message', handleLobbyChatMessage);
    socket.on('online_users', handleOnlineUsers);
    socket.on('friendAdded', handleFriendAdded);

    // Listen for the custom online_users_updated event
    const handleOnlineUsersUpdated = (event: CustomEvent<string[]>) => {
      console.log('Online users custom event:', event.detail);
      setOnlinePlayers(prev => prev.map(player => ({
        ...player,
        online: event.detail.includes(player.id)
      })));
    };
    window.addEventListener('online_users_updated', handleOnlineUsersUpdated as EventListener);

    // Cleanup
    return () => {
      console.log('Cleaning up socket event handlers');
      socket.off('games_updated', handleGamesUpdated);
      socket.off('all_games_updated', handleAllGamesUpdated);
      socket.off('lobby_chat_message', handleLobbyChatMessage);
      socket.off('online_users', handleOnlineUsers);
      socket.off('friendAdded', handleFriendAdded);
      window.removeEventListener('online_users_updated', handleOnlineUsersUpdated as EventListener);
    };
  }, [socket, isAuthenticated, user, navigate]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    const message: ChatMessage = {
      id: `${user.id}-${Date.now()}`,
      userId: user.id,
      userName: user.username,
      message: newMessage.trim(),
      timestamp: Date.now()
    };
    setNewMessage('');
    if (socket) {
      socket.emit('lobby_chat_message', message);
    }
  };

  const handleCreateGame = async (settings: any) => {
    setIsCreateGameModalOpen(false);
    try {
      const res = await api.post('/api/games', {
        ...settings,
        creatorId: user.id,
        creatorName: user.username,
        creatorImage: user.avatar // or user.image if that's the field
      });
      if (!res.ok) throw new Error('Failed to create game');
      const game: GameState = await res.json();
      navigate(`/table/${game.id}`);
    } catch (err) {
      alert('Failed to create game');
    }
  };

  const filteredGames = games.filter(game => {
    if (filter === 'waiting') return game.status === 'WAITING';
    if (filter === 'in-progress') return game.status === 'PLAYING';
    return game.status === 'WAITING'; // Default to waiting games
  });

  // Handler to join a game as a player, with seat index
  const handleJoinGame = async (gameId: string, seatIndex: number) => {
    if (!user) return;
    // Ensure user is not null before accessing properties
    const { id, username, avatar } = user;
    const res = await api.post(`/api/games/${gameId}/join`, {
      id,
      username,
      avatar,
      seat: seatIndex,
    });
    if (!res.ok) {
      const error = await res.json();
      alert('Failed to join game: ' + (error.error || 'Unknown error'));
      return;
    }
    navigate(`/table/${gameId}`);
  };

  // Handler to watch a game as an observer
  const handleWatchGame = (gameId: string) => {
    navigate(`/table/${gameId}?spectate=1`);
  };

  const getGameTypeBrick = (game: GameState) => {
    const type = game.rules?.gameType || 'REGULAR';
    let color = 'bg-green-600';
    let label = 'REGULAR';
    if (type === 'WHIZ') {
      color = 'bg-blue-600';
      label = 'WHIZ';
    } else if (type === 'MIRROR') {
      color = 'bg-red-600';
      label = 'MIRRORS';
    } else if (game.forcedBid && type === 'REGULAR') {
      color = 'bg-orange-500';
              if (game.forcedBid === 'BID4NIL') label = '4 OR NIL';
      else if (game.forcedBid === 'BID3') label = 'BID 3';
      else if (game.forcedBid === 'BIDHEARTS') label = 'BID ♥s';
      else if (game.forcedBid === 'SUICIDE') label = 'SUICIDE';
      else if (game.forcedBid === 'CRAZY ACES') label = 'CRAZY As';
      else label = 'GIMMICK';
    }
    return <span className={`inline whitespace-nowrap ${color} text-white font-bold text-xs px-2 py-0.5 rounded mr-2`}>{label}</span>;
  };

  const getSpecialBricks = (game: GameState) => {
    const bricks = [];
    if (game.specialRules?.assassin) {
      bricks.push(<span key="assassin" className="inline whitespace-nowrap bg-red-600 text-white font-bold text-xs px-2 py-0.5 rounded ml-2">ASSASSIN</span>);
    }
    if (game.specialRules?.screamer) {
      bricks.push(<span key="screamer" className="inline whitespace-nowrap bg-blue-600 text-white font-bold text-xs px-2 py-0.5 rounded ml-2">SCREAMER</span>);
    }
    return bricks;
  };

  const GameTile: React.FC<{ game: GameState }> = ({ game }) => {
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
          {game.rules?.allowNil && <span className="text-slate-300 ml-2">nil <span className="align-middle">☑️</span></span>}
          {!game.rules?.allowNil && <span className="text-slate-300 ml-2">nil <span className="align-middle">❌</span></span>}
          <span className="text-slate-300 ml-2">bn <span className="align-middle">{game.rules?.allowBlindNil ? '☑️' : '❌'}</span></span>
        </div>
        {/* Line 2: Buy-in, game mode, and special bricks */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-yellow-500 text-lg font-bold">{((game.buyIn ?? game.rules?.coinAmount ?? 100000) / 1000).toFixed(0)}k</span>
          <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
          <span className="ml-2 text-xs font-bold text-slate-200 uppercase">{game.gameMode || (game.rules?.gameType === 'SOLO' ? 'SOLO' : 'PARTNERS')}</span>
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
                        src={isPlayer(player) ? player.avatar : isBot(player) ? player.avatar : '/bot-avatar.jpg'}
                        alt=""
                        className="w-16 h-16 rounded-full border-2 border-slate-600"
                      />
                      <span className="text-xs text-slate-200 -mt-1 block bg-slate-800/80 px-2 py-0.5 rounded-full">
                        {isPlayer(player) ? (player.username || player.name) : isBot(player) ? player.username : 'Player'}
                      </span>
                    </div>
                  ) : (
                    <button
                      className="w-16 h-16 rounded-full bg-slate-600 border border-slate-300 text-slate-200 text-base flex items-center justify-center hover:bg-slate-500 transition"
                      onClick={() => handleJoinGame(game.id, seat)}
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
          <button className="px-3 py-1 bg-slate-700 text-slate-300 text-xs rounded-full hover:bg-slate-600 transition" onClick={() => handleWatchGame(game.id)}>
            Watch
          </button>
        </div>
      </div>
    );
  };

  // Handler to open stats for current user
  const handleOpenMyStats = () => {
    if (!user) return;
    setSelectedPlayer({
      username: user.username,
      avatar: user.avatar,
      stats: user.stats || {
        gamesPlayed: 0,
        gamesWon: 0,
        nilsBid: 0,
        nilsMade: 0,
        blindNilsBid: 0,
        blindNilsMade: 0,
      },
      coins: user.coins,
    });
    setIsPlayerStatsOpen(true);
  };

  // Handler to open stats for another player
  const handleOpenPlayerStats = async (player: any) => {
    try {
      // Fetch player stats from the server
      const response = await api.get(`/api/users/${player.id}/stats`);
      const stats = await response.json();
      
      setSelectedPlayer({
        username: player.username,
        avatar: player.avatar,
        status: player.status,
        coins: player.coins,
        stats: stats || {
          gamesPlayed: 0,
          gamesWon: 0,
          nilsBid: 0,
          nilsMade: 0,
          blindNilsBid: 0,
          blindNilsMade: 0,
        },
      });
      setIsPlayerStatsOpen(true);
    } catch (error) {
      console.error('Error fetching player stats:', error);
      // Fallback with default stats if fetch fails
      setSelectedPlayer({
        username: player.username,
        avatar: player.avatar,
        status: player.status,
        coins: player.coins,
        stats: {
          gamesPlayed: 0,
          gamesWon: 0,
          nilsBid: 0,
          nilsMade: 0,
          blindNilsBid: 0,
          blindNilsMade: 0,
        },
      });
      setIsPlayerStatsOpen(true);
    }
  };

  // Insert emoji at cursor position
  const handleSelectEmoji = (emoji: any) => {
    if (!inputRef.current) return;
    const input = inputRef.current;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const before = newMessage.slice(0, start);
    const after = newMessage.slice(end);
    const emojiChar = emoji.native || emoji.colons || '';
    const updated = before + emojiChar + after;
    setNewMessage(updated);
    setShowEmojiPicker(false);
    // Move cursor after emoji
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(start + emojiChar.length, start + emojiChar.length);
    }, 0);
  };

  // Fetch real users for the lobby
  useEffect(() => {
    api.get('/api/users')
      .then(res => res.json())
      .then(setOnlinePlayers)
      .catch(() => setOnlinePlayers([]));
  }, [user.id]);

  // Fetch games as a fallback for loading spinner
  useEffect(() => {
    api.get('/api/games')
      .then(res => res.json())
      .then((games) => {
        setGames(games);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  // Timeout fallback for loading spinner
  useEffect(() => {
    const timeout = setTimeout(() => setIsLoading(false), 2000);
    return () => clearTimeout(timeout);
  }, []);

  const handleConfirmAction = async () => {
    if (!confirmModal.player) return;
    const player = confirmModal.player;
    let endpoint = '';
    let body: any = {};

    if (confirmModal.action === 'add-friend') {
      endpoint = '/api/social/friends/add';
      body.friendId = player.id;
    } else if (confirmModal.action === 'remove-friend') {
      endpoint = '/api/social/friends/remove';
      body.friendId = player.id;
    } else if (confirmModal.action === 'block') {
      endpoint = '/api/social/block';
      body.blockId = player.id;
    } else if (confirmModal.action === 'unblock') {
      endpoint = '/api/social/unblock';
      body.blockId = player.id;
    }

    if (endpoint) {
      try {
        await api.post(endpoint, body);
      // Refresh player list
        const response = await api.get('/api/users');
        const players = await response.json();
        setOnlinePlayers(players);
      } catch (error) {
        console.error('Error performing social action:', error);
        alert('Failed to perform action. Please try again.');
      }
    }
    setConfirmModal({ open: false, player: null, action: '' });
  };

  // Handler to dismiss welcome modal and persist in localStorage
  const handleDismissWelcomeModal = () => {
    setShowWelcomeModal(false);
    localStorage.setItem('welcomeModalDismissed', 'true');
  };

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getUserAvatar = (userId: string): string => {
    const player = onlinePlayers.find(p => p.id === userId);
    return player?.avatar || '/default-pfp.jpg';
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <Header onOpenMyStats={handleOpenMyStats} />
      
      {/* Mobile portrait toggle */}
      <div className="md:hidden flex justify-center items-center py-2 px-4">
        <span className={`text-base font-bold mr-2 ${mobileTab === 'lobby' ? 'text-indigo-600' : 'text-slate-400'}`}>Lobby</span>
        <button
          className={`relative w-14 h-8 bg-slate-700 rounded-full flex items-center transition-colors duration-200 focus:outline-none`}
          onClick={() => setMobileTab(mobileTab === 'lobby' ? 'chat' : 'lobby')}
          aria-label="Toggle Lobby/Chat"
        >
          <span
            className={`absolute left-1 top-1 w-6 h-6 rounded-full bg-white shadow transition-transform duration-200 ${mobileTab === 'chat' ? 'translate-x-6' : ''}`}
          ></span>
        </button>
        <span className={`text-base font-bold ml-2 ${mobileTab === 'chat' ? 'text-indigo-600' : 'text-slate-400'}`}>Chat</span>
      </div>

      <main className="container mx-auto px-4 py-4 h-[calc(100vh-64px-32px)]">
        <div
          className={
            // Desktop: 3 columns, Tablet/Mobile: 2 columns, Mobile portrait: 1 column
            'grid h-full ' +
            'lg:grid-cols-3 md:grid-cols-2 grid-cols-1 gap-4'
          }
          style={{ height: '100%' }}
        >
          {/* Games Section */}
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
                onClick={() => setIsCreateGameModalOpen(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition"
              >
                Create Game
              </button>
            </div>

            <div className="flex space-x-4 mb-4">
              <button
                onClick={() => setFilter('waiting')}
                className={`px-3 py-1 rounded-md ${
                  filter === 'waiting' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                Waiting
              </button>
              <button
                onClick={() => setFilter('in-progress')}
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
                  <GameTile key={game.id} game={game} />
                ))}
              </div>
            )}
          </div>

          {/* Chat Section */}
          <div
            className={
              'bg-slate-800 rounded-lg flex flex-col h-[calc(100vh-64px-32px)] p-4 ' +
              (mobileTab !== 'chat' ? 'hidden md:flex' : 'flex')
            }
          >
            {/* Chat/Players Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button
                  className={`w-20 h-10 flex items-center justify-center rounded-md text-sm font-semibold transition ${activeChatTab === 'chat' ? 'bg-indigo-600' : 'bg-slate-700'}`}
                  onClick={() => setActiveChatTab('chat')}
                  aria-label="Chat"
                >
                  <img src="/chat.svg" alt="Chat" className="w-6 h-6" style={{ filter: 'invert(1) brightness(2)' }} />
                </button>
                <button
                  className={`w-20 h-10 flex items-center justify-center rounded-md text-sm font-semibold transition ${activeChatTab === 'players' ? 'bg-indigo-600' : 'bg-slate-700'}`}
                  onClick={() => setActiveChatTab('players')}
                  aria-label="Players"
                >
                  <img src="/players.svg" alt="Players" className="w-6 h-6" style={{ filter: 'invert(1) brightness(2)' }} />
                </button>
              </div>
              <div className="flex items-center space-x-1">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                <span className="text-slate-300 text-sm font-medium">{onlineCount} online</span>
              </div>
            </div>
            {/* Tab Content */}
            {activeChatTab === 'chat' ? (
              <>
                <div
                  ref={chatContainerRef}
                  className="flex-1 overflow-y-auto flex flex-col gap-y-4"
                >
                  {chatMessages.map((msg, index) => (
                    msg.userId === 'system' ? (
                      <div
                        key={msg.id || index}
                        className="w-full text-center my-2"
                      >
                        <span className="text-orange-400 italic flex items-center justify-center gap-1">
                          {msg.message}
                        </span>
                      </div>
                    ) : (
                      <div
                        key={msg.id || index}
                        className={`mb-2 flex items-start ${msg.userId === user.id ? 'justify-end' : ''}`}
                      >
                        {msg.userId !== user.id && (
                          <div className={`w-8 h-8 mr-2 rounded-full overflow-hidden flex-shrink-0`}>
                            <img 
                              src={getUserAvatar(msg.userId)} 
                              alt={msg.userName || ''} 
                              width={32}
                              height={32}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className={`max-w-[80%] ${msg.userId === user.id ? 'bg-blue-600 text-white' : 'bg-gray-700 text-white'} rounded-lg px-3 py-2`}>
                          <div className="flex justify-between items-center mb-1">
                            {msg.userId !== user.id && (
                              <span className="font-medium text-xs opacity-80">{msg.userName}</span>
                            )}
                            <span className="text-xs opacity-75 ml-auto"> {formatTime(msg.timestamp)}</span>
                          </div>
                          <p>{msg.message}</p>
                        </div>
                        {msg.userId === user.id && (
                          <div className={`w-8 h-8 ml-2 rounded-full overflow-hidden flex-shrink-0`}>
                            <img 
                              src={user.avatar || getUserAvatar(msg.userId)} 
                              alt={msg.userName || ''} 
                              width={32}
                              height={32}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                      </div>
                    )
                  ))}
                  {chatMessages.length === 0 && (
                    <div className="text-center text-slate-400 py-4">
                      No messages yet. Start the conversation!
                    </div>
                  )}
                </div>
                <form onSubmit={handleSendMessage} className="mt-auto relative">
                  <div className="flex flex-row items-center space-x-2 w-full">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 min-w-0 bg-slate-700 text-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10"
                      ref={inputRef}
                    />
                    {/* Emoji Picker Button */}
                    <div className="relative flex-shrink-0">
                      <button
                        type="button"
                        className="flex items-center justify-center w-10 h-10 rounded-md hover:bg-slate-600 transition"
                        onClick={() => setShowEmojiPicker((v) => !v)}
                        tabIndex={-1}
                      >
                        <span role="img" aria-label="emoji" className="text-2xl">😊</span>
                      </button>
                      {/* Emoji Picker Dropdown */}
                      {showEmojiPicker && (
                        <div className="absolute right-0 bottom-12 z-50">
                          <Picker data={data} onEmojiSelect={handleSelectEmoji} theme="dark" />
                        </div>
                      )}
                    </div>
                    {/* Send Button as Icon (right-pointing) */}
                    <button
                      type="submit"
                      className="w-10 h-10 flex items-center justify-center rounded-md bg-indigo-600 hover:bg-indigo-700 transition flex-shrink-0"
                      aria-label="Send"
                    >
                      {/* Right-pointing paper plane icon */}
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l16 8-16 8 4-8z" />
                      </svg>
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                {/* Friends summary row */}
                <div className="bg-indigo-900 rounded mb-2 px-6 py-2 flex flex-col justify-center" style={{ minHeight: '64px' }}>
                  <div className="flex items-center justify-between h-8">
                    <span className="flex items-center gap-2 text-slate-200 text-lg font-bold">
                      <img src="/friend.svg" alt="Friends" className="w-8 h-8" style={{ filter: 'invert(1) brightness(2)' }} />
                      Friends: {onlinePlayers.filter(p => p.status === 'friend').length}
                    </span>
                    <span className="flex items-center gap-1 text-slate-300 text-sm font-medium">
                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                      {onlinePlayers.filter(p => p.status === 'friend' && p.online).length} Online
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    <label className="flex items-center gap-1 cursor-pointer text-slate-300 text-sm">
                      <input
                        type="radio"
                        name="playerFilter"
                        value="all"
                        checked={playerFilter === 'all'}
                        onChange={() => setPlayerFilter('all')}
                        className="accent-indigo-600"
                      />
                      All
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer text-slate-300 text-sm">
                      <input
                        type="radio"
                        name="playerFilter"
                        value="friends"
                        checked={playerFilter === 'friends'}
                        onChange={() => setPlayerFilter('friends')}
                        className="accent-indigo-600"
                      />
                      Friends
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer text-slate-300 text-sm">
                      <input
                        type="radio"
                        name="playerFilter"
                        value="hide-blocked"
                        checked={playerFilter === 'hide-blocked'}
                        onChange={() => setPlayerFilter('hide-blocked')}
                        className="accent-indigo-600"
                      />
                      Hide Blocked
                    </label>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                  {onlinePlayers
                    .filter(player =>
                      playerFilter === 'all' ? true :
                      playerFilter === 'friends' ? player.status === 'friend' :
                      player.status !== 'blocked'
                    )
                    .sort((a, b) => {
                      // First priority: friends come first
                      if (a.status === 'friend' && b.status !== 'friend') return -1;
                      if (b.status === 'friend' && a.status !== 'friend') return 1;
                      
                      // Second priority: online status
                      if (b.online !== a.online) return Number(b.online) - Number(a.online);
                      
                      // Third priority: blocked status (when showing all)
                      if (playerFilter === 'all') {
                        if (a.status === 'blocked' && b.status !== 'blocked') return 1;
                        if (b.status === 'blocked' && a.status !== 'blocked') return -1;
                      }
                      
                      return 0;
                    })
                    .map(player => (
                      <div key={player.id} className="flex items-center gap-3 p-2 rounded bg-slate-700">
                        <img src={isPlayer(player) ? (player.avatar || '/default-pfp.jpg') : isBot(player) ? (player.avatar || '/bot-avatar.jpg') : '/bot-avatar.jpg'} alt="" className="w-8 h-8 rounded-full border-2 border-slate-600" />
                        <span
                          className={`text-sm font-medium ${player.online ? 'text-green-400' : 'text-slate-300'} flex items-center cursor-pointer hover:underline`}
                          onClick={() => handleOpenPlayerStats(player)}
                        >
                          {isPlayer(player) ? (player.username || player.name) : isBot(player) ? player.username : 'Player'}
                          {player.online && <span className="ml-2 inline-block w-2 h-2 bg-green-500 rounded-full"></span>}
                          {player.status === 'friend' && (
                            <img src="/friend.svg" alt="Friend" className="ml-2 w-6 h-6" style={{ filter: 'invert(1) brightness(2)' }} />
                          )}
                        </span>
                        <div className="flex gap-2 ml-auto items-center">
                          {/* Hide action buttons for self */}
                          {player.id !== user.id && (
                            player.status === 'blocked' ? (
                              <>
                                <span className="text-slate-400 text-xs mr-2 flex items-center h-8">unblock?</span>
                                <button className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-600 border border-slate-300 hover:bg-slate-500" title="Unblock"
                                  onClick={() => setConfirmModal({ open: true, player, action: 'unblock' })}>
                                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                                    <circle cx="12" cy="12" r="11" stroke="white" strokeWidth="2" />
                                    <path d="M6 18L18 6" stroke="white" strokeWidth="2.5" />
                                  </svg>
                                </button>
                              </>
                            ) : (
                              player.status === 'friend' ? (
                                <>
                                  <button className="w-8 h-8 flex items-center justify-center rounded-full bg-red-600 border border-slate-300 hover:bg-red-700" title="Remove Friend"
                                    onClick={() => setConfirmModal({ open: true, player, action: 'remove-friend' })}>
                                    <img src="/remove-friend.svg" alt="Remove Friend" className="w-5 h-5" style={{ filter: 'invert(1) brightness(2)' }} />
                                  </button>
                                  <button className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-600 border border-slate-300 hover:bg-slate-500" title="Block"
                                    onClick={() => setConfirmModal({ open: true, player, action: 'block' })}>
                                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                                      <circle cx="12" cy="12" r="11" stroke="white" strokeWidth="2" />
                                      <path d="M4 4L20 20M20 4L4 20" stroke="white" strokeWidth="2.5" />
                                    </svg>
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button className="w-8 h-8 flex items-center justify-center rounded-full bg-green-600 border border-slate-300 hover:bg-green-700" title="Add Friend"
                                    onClick={() => setConfirmModal({ open: true, player, action: 'add-friend' })}>
                                    <img src="/add-friend.svg" alt="Add Friend" className="w-5 h-5" style={{ filter: 'invert(1) brightness(2)' }} />
                                  </button>
                                  <button className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-600 border border-slate-300 hover:bg-slate-500" title="Block"
                                    onClick={() => setConfirmModal({ open: true, player, action: 'block' })}>
                                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                                      <circle cx="12" cy="12" r="11" stroke="white" strokeWidth="2" />
                                      <path d="M4 4L20 20M20 4L4 20" stroke="white" strokeWidth="2.5" />
                                    </svg>
                                  </button>
                                </>
                              )
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  {onlinePlayers.length === 0 && (
                    <div className="text-center text-slate-400 py-4">No players found.</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      <CreateGameModal
        isOpen={isCreateGameModalOpen}
        onClose={() => setIsCreateGameModalOpen(false)}
        onCreateGame={handleCreateGame}
      />

      <NewUserWelcomeModal
        isOpen={showWelcomeModal}
        onClose={handleDismissWelcomeModal}
      />

      <PlayerStatsModal
        isOpen={isPlayerStatsOpen}
        onClose={() => setIsPlayerStatsOpen(false)}
        player={selectedPlayer}
      />

      {/* Confirmation Modal */}
      <ConfirmActionModal
        open={confirmModal.open}
        player={confirmModal.player}
        action={confirmModal.action}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmModal({ open: false, player: null, action: '' })}
      />
    </div>
  );
};

export default HomePage; 