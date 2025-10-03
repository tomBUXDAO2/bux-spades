import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import CreateGameModal from '@/components/game/CreateGameModal';
import NewUserWelcomeModal from '@/components/modals/NewUserWelcomeModal';
import Header from '@/components/common/Header';
import PlayerStatsModal from '@/components/modals/PlayerStatsModal';
import FriendBlockConfirmModal from '@/components/modals/FriendBlockConfirmModal';
import ClosurePopup from '@/components/modals/ClosurePopup';
import GameTile from '@/components/game/GameTile';
import GamesSection from '@/features/lobby/components/lobby/GamesSection';
import ChatSection from '@/features/lobby/components/lobby/ChatSection';
import MobileToggle from '@/features/lobby/components/lobby/MobileToggle';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import type { GameState, Player, Bot } from "../../types/game""";
import { useNavigate } from 'react-router-dom';
import { useSocket } from '@/features/auth/SocketContext';
import { api } from '@/services/lib/api';

interface ChatMessage {
  id?: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: number;
  isGameMessage?: boolean;
}


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
  if (!user) {
    console.log('HomePage - No user, showing loading');
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><div className="text-white text-2xl">Loading...</div></div>;
  }
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
  const onlineCount = Array.isArray(onlinePlayers) ? onlinePlayers.filter(p => p.online).length : 0;
  const [isPlayerStatsOpen, setIsPlayerStatsOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mobileTab, setMobileTab] = useState<'lobby' | 'chat'>('lobby');
  const navigate = useNavigate();
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; player: any; action: 'add_friend' | 'remove_friend' | 'block_user' | 'unblock_user' }>({ open: false, player: null, action: 'add_friend' });
  const onlineIdsRef = useRef<string[]>([]);
  const [closureMessage, setClosureMessage] = useState('');

  // Show table closure message if present (set by TablePage before redirect)
  useEffect(() => {
    try {
      const msg = localStorage.getItem('tableClosureMessage');
      if (msg) {
        setClosureMessage(msg);
        localStorage.removeItem('tableClosureMessage');
      }
    } catch {}
  }, []);

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
    if (!user || !isAuthenticated) return;

    const checkForLeagueGames = async () => {
      try {
        
        // Get all games from the server
        const response = await api.get('/api/games');
        if (response.ok) {
          const responseData = await response.json();
          const allGames = Array.isArray(responseData) ? responseData : (responseData.games || []);
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
            
            
            return isLeagueGame && isUserInGame && isWaiting;
          });
          
          if (userLeagueGame) {
            localStorage.setItem('activeGameId', userLeagueGame.id);
            navigate(`/table/${userLeagueGame.id}`, { replace: true });
          } else {
            // If no league game, check for any active game where this user is a player
            const activeGame = allGames.find((game: any) => {
              const isUserInGame = game.players?.some((p: any) => p && p.id === user.id);
              const isActive = game.status === 'WAITING' || game.status === 'BIDDING' || game.status === 'PLAYING';
              return isUserInGame && isActive;
            });
            if (activeGame) {
              // Player is in an active game - redirect them to it
              localStorage.setItem('activeGameId', activeGame.id);
              navigate(`/table/${activeGame.id}`, { replace: true });
            }
          }
        }
      } catch (error) {
        console.error('[LEAGUE GAME CHECK] Error checking for league games:', error);
      }
    };

    checkForLeagueGames();
  }, [user, navigate, isAuthenticated]);

  // Periodic check for league games (fallback for missed real-time events)
  useEffect(() => {
    if (!user || !isAuthenticated) return;
    
    
    const checkForLeagueGames = async () => {
      try {
        const response = await api.get('/api/games');
        if (response.ok) {
          const responseData = await response.json();
          const allGames = Array.isArray(responseData) ? responseData : (responseData.games || []);
          
          const userLeagueGame = allGames.find((game: any) => {
            const isLeagueGame = game.league;
            const isUserInGame = game.players?.some((player: any) => player && player.id === user.id);
            const isWaiting = game.status === 'WAITING';
            
            
            return isLeagueGame && isUserInGame && isWaiting;
          });
          
          if (userLeagueGame) {
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
      clearInterval(interval);
    };
  }, [user, navigate, isAuthenticated]);

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
      
      // Also refetch user data to update activeGameId for watch buttons
      api.get('/api/auth/users')
        .then(res => res.json())
        .then((users) => {
          const filtered = Array.isArray(users)
            ? users.filter((u: any) => !(
                (u && typeof u === 'object' && 'type' in u && u.type === 'bot') ||
                (typeof u?.username === 'string' && (u.username.startsWith('Bot ') || u.username.startsWith('Bot_'))) ||
                (typeof u?.id === 'string' && u.id.startsWith('bot-'))
              ))
            : [];
          setOnlinePlayers(filtered);
        })
        .catch(err => console.error('Error fetching users:', err));
    };
    const handleAllGamesUpdated = (allGames: GameState[]) => {
      console.log('All games updated (including league games):', allGames);
      
      // Check if any of the updated games is a league game for this user
      if (user) {
        const userLeagueGame = allGames.find((game: any) => {
          const isLeagueGame = game.league;
          const isUserInGame = game.players?.some((player: any) => player && player.id === user.id);
          const isWaiting = game.status === 'WAITING';
          
          
          return isLeagueGame && isUserInGame && isWaiting;
        });
        
        if (userLeagueGame) {
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
            const name = player?.username || player?.name;
            // Only show join message if we have the actual username
            if (!name) {
              return null;
            }
            return {
              id: `system-${Date.now()}-${id}`,
              userId: 'system',
              userName: 'System',
              message: `${name} joined the lobby`,
              timestamp: Date.now()
            } as ChatMessage;
          }).filter((msg): msg is ChatMessage => msg !== null) // Type guard to remove null entries
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
      api.get('/api/auth/users')
        .then(res => res.json())
        .then((data) => {
          const users = data.users || data;
          const filtered = Array.isArray(users)
            ? users.filter((u: any) => !(
                (u && typeof u === 'object' && 'type' in u && u.type === 'bot') ||
                (typeof u?.username === 'string' && (u.username.startsWith('Bot ') || u.username.startsWith('Bot_'))) ||
                (typeof u?.id === 'string' && u.id.startsWith('bot-'))
              ))
            : [];
          setOnlinePlayers(filtered);
        })
        .catch(err => console.error('Failed to refresh player list:', err));
    };

    const handleFriendRemoved = () => {
      console.log('Friend removed, refreshing player list');
      handleFriendAdded(); // Reuse the same logic
    };

    const handleUserBlocked = () => {
      console.log('User blocked, refreshing player list');
      handleFriendAdded(); // Reuse the same logic
    };

    const handleUserUnblocked = () => {
      console.log('User unblocked, refreshing player list');
      handleFriendAdded(); // Reuse the same logic
    };

    // Add event listeners
    socket.on('games_updated', handleGamesUpdated);
    socket.on('all_games_updated', handleAllGamesUpdated);
    socket.on('lobby_chat_message', handleLobbyChatMessage);
    socket.on('online_users', handleOnlineUsers);
    socket.on('friendAdded', handleFriendAdded);
    socket.on('friendRemoved', handleFriendRemoved);
    socket.on('userBlocked', handleUserBlocked);
    socket.on('userUnblocked', handleUserUnblocked);
    // Note: game_joined listener removed - navigation is handled by the table page itself
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
            // game_joined listener removed
      window.removeEventListener('online_users_updated', handleOnlineUsersUpdated as EventListener);
    };
  }, [socket, isAuthenticated, user, navigate]);

  // Single consolidated periodic games refresh
  useEffect(() => {
    if (!user || !isAuthenticated) return;
    
    const refreshGames = async () => {
      try {
        const response = await api.get('/api/games');
        if (response.ok) {
          const data = await response.json();
          setGames(data.games || []);
          // Reduced logging frequency - only log on first refresh or errors
        }
      } catch (error) {
        console.error('[GAMES REFRESH] Failed to refresh games:', error);
      }
    };
    
    // Refresh every 15 seconds (reduced from 10 to avoid excessive calls)
    const interval = setInterval(refreshGames, 15000);
    
    return () => clearInterval(interval);
  }, [user, isAuthenticated]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setNewMessage('');
    if (socket) {
      socket.emit('lobby_message', { message: newMessage.trim() });
    }
  };

  const handleCreateGame = async (settings: any) => {
    setIsCreateGameModalOpen(false);
    try {
      // Map client fields to server fields
      const serverSettings = {
        mode: settings.gameMode, // client sends 'gameMode', server expects 'mode'
        biddingOption: settings.biddingOption,
        minPoints: settings.minPoints,
        maxPoints: settings.maxPoints,
        buyIn: settings.buyIn,
        allowNil: settings.specialRules?.allowNil ?? true,
        allowBlindNil: settings.specialRules?.allowBlindNil ?? false,
        specialRules: settings.specialRules,
        creatorId: user.id,
        creatorName: user.username,
        creatorImage: user.avatar
      };
      
      const res = await api.post('/api/games', serverSettings);
      if (!res.ok) throw new Error('Failed to create game');
      const response = await res.json();
      const game: GameState = response;
      
      // Set active game id so socket auto-joins immediately on table load
      try { localStorage.setItem('activeGameId', game.id); } catch {}
      
      // Add small delay to ensure game is fully created on server
      await new Promise(resolve => setTimeout(resolve, 200));
      
      navigate(`/table/${game.id}`);
    } catch (err) {
      console.error('Game creation error:', err);
      alert('Failed to create game');
    }
  };

  // Debug games data - removed excessive logging
  
  const filteredGames = Array.isArray(games) ? games.filter(game => {
    if (filter === 'waiting') return game.status === 'WAITING';
    if (filter === 'in-progress') return game.status === 'PLAYING';
    return game.status === 'WAITING'; // Default to waiting games
  }) : [];

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


  // Handler to open stats for current user
  const handleOpenMyStats = async () => {
    try {
      // Fetch user stats from the server with ALL mode for initial load
      const response = await api.get(`/api/users/${user.id}/stats?gameMode=ALL`);
      const stats = await response.json();
      
      setSelectedPlayer({
        id: user.id, // Add user ID for API calls
        username: user.username,
        avatar: user.avatar || user.avatarUrl || '/default-avatar.png',
        avatarUrl: user.avatarUrl,
        status: 'not_friend' as const,
        coins: user.coins,
        stats: stats.stats || {
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
      console.error('Error fetching user stats:', error);
      // Fallback with default stats if fetch fails
      setSelectedPlayer({
        id: user.id, // Add user ID for API calls
        username: user.username,
        avatar: user.avatar || user.avatarUrl || '/default-avatar.png',
        avatarUrl: user.avatarUrl,
        status: 'not_friend' as const,
        coins: user.coins,
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

  // Handler to open stats for another player
  const handleOpenPlayerStats = async (player: any) => {
    try {
      // Fetch player stats from the server with ALL mode for initial load
      const response = await api.get(`/api/users/${player.id}/stats?gameMode=ALL`);
      const stats = await response.json();
      
      setSelectedPlayer({
        id: player.id, // Add player ID for API calls
        username: player.username,
        avatar: player.avatar || player.avatarUrl || '/default-avatar.png',
        avatarUrl: player.avatarUrl,
        status: player.status,
        coins: player.coins,
        stats: stats.stats || {
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
        id: player.id, // Add player ID for API calls
        username: player.username,
        avatar: player.avatar || player.avatarUrl || '/default-avatar.png',
        avatarUrl: player.avatarUrl,
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
    api.get('/api/auth/users')
      .then(res => res.json())
      .then((data) => {
        // Handle the correct response format: { users: [...] }
        const users = data.users || data; // Fallback to direct array for compatibility
        const filtered = Array.isArray(users)
          ? users.filter((u: any) => !(
              (u && typeof u === 'object' && 'type' in u && u.type === 'bot') ||
              (typeof u?.username === 'string' && (u.username.startsWith('Bot ') || u.username.startsWith('Bot_'))) ||
              (typeof u?.id === 'string' && u.id.startsWith('bot-'))
            ))
          : [];
        setOnlinePlayers(filtered);
      })
      .catch((error) => {
        console.error('[HOMEPAGE] Failed to load users:', error);
        setOnlinePlayers([]);
      });
  }, [user?.id]);

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
    if (!confirmModal.player) {
      console.error('[FRIEND ACTION] No player selected');
      return;
    }
    
    if (!socket) {
      console.error('[FRIEND ACTION] Socket not available');
      alert('Connection not available. Please try again.');
      return;
    }
    
    if (!isAuthenticated) {
      console.error('[FRIEND ACTION] Socket not authenticated');
      alert('Not authenticated. Please refresh the page and try again.');
      return;
    }
    
    if (!socket.connected) {
      console.error('[FRIEND ACTION] Socket not connected');
      alert('Not connected to server. Please check your connection and try again.');
      return;
    }
    
    const player = confirmModal.player;

    // Use socket events instead of API calls
    if (confirmModal.action === 'add_friend') {
      socket.emit('add_friend', { targetUserId: player.id });
    } else if (confirmModal.action === 'remove_friend') {
      socket.emit('remove_friend', { targetUserId: player.id });
    } else if (confirmModal.action === 'block_user') {
      socket.emit('block_user', { targetUserId: player.id });
    } else if (confirmModal.action === 'unblock_user') {
      socket.emit('unblock_user', { targetUserId: player.id });
    }

    // Close the modal
    setConfirmModal({ open: false, player: null, action: 'add_friend' });
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
      <ClosurePopup
        message={closureMessage}
        onClose={() => setClosureMessage('')}
      />
      
      {/* Mobile portrait toggle */}
      <MobileToggle
        mobileTab={mobileTab}
        onToggle={() => setMobileTab(mobileTab === 'lobby' ? 'chat' : 'lobby')}
      />

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
          <GamesSection
            games={games}
            filteredGames={filteredGames}
            isLoading={isLoading}
            filter={filter}
            mobileTab={mobileTab}
            onFilterChange={setFilter}
            onCreateGame={() => setIsCreateGameModalOpen(true)}
            onJoinGame={handleJoinGame}
            onWatchGame={handleWatchGame}
          />

          {/* Chat Section */}
          <ChatSection
            mobileTab={mobileTab}
            activeChatTab={activeChatTab}
            onlineCount={onlineCount}
            chatMessages={chatMessages}
            newMessage={newMessage}
            showEmojiPicker={showEmojiPicker}
            onlinePlayers={onlinePlayers}
            playerFilter={playerFilter}
            user={user}
            chatContainerRef={chatContainerRef}
            inputRef={inputRef}
            onSetActiveChatTab={setActiveChatTab}
            onSetNewMessage={setNewMessage}
            onSetShowEmojiPicker={setShowEmojiPicker}
            onSetPlayerFilter={setPlayerFilter}
            onSendMessage={handleSendMessage}
            onSelectEmoji={handleSelectEmoji}
            onOpenPlayerStats={handleOpenPlayerStats}
            onWatchGame={handleWatchGame}
            onSetConfirmModal={(modal) => setConfirmModal(modal)}
            formatTime={formatTime}
            getUserAvatar={getUserAvatar}
          />
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
      <FriendBlockConfirmModal
        isOpen={confirmModal.open}
        action={confirmModal.action}
        username={confirmModal.player?.username || 'Unknown User'}
        onConfirm={handleConfirmAction}
        onClose={() => setConfirmModal({ open: false, player: null, action: 'add_friend' })}
      />
    </div>
  );
};

export default HomePage; 