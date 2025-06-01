import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import CreateGameModal from '@/components/game/CreateGameModal';
import NewUserWelcomeModal from '@/components/modals/NewUserWelcomeModal';
import Header from '@/components/common/Header';
import PlayerStatsModal from '@/components/modals/PlayerStatsModal';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import type { Game } from '../../../shared/types/game';
import { useNavigate } from 'react-router-dom';
import { io as socketIOClient } from 'socket.io-client';

interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: Date;
}

const HomePage: React.FC = () => {
  const { user } = useAuth();
  const [isCreateGameModalOpen, setIsCreateGameModalOpen] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [games, setGames] = useState<Game[]>([]);
  const [filter, setFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [activeChatTab, setActiveChatTab] = useState<'chat' | 'players'>('chat');
  const [playerFilter, setPlayerFilter] = useState<'all' | 'friends' | 'hide-blocked'>('all');
  const onlinePlayers = [
    { id: '1', username: 'Player1', avatar: '/default-pfp.jpg', online: true, status: 'friend' },
    { id: '2', username: 'AceKing', avatar: '/default-pfp.jpg', online: true, status: 'blocked' },
    { id: '3', username: 'QueenBee', avatar: '/default-pfp.jpg', online: true, status: 'other' },
    { id: '4', username: 'SpadesPro', avatar: '/default-pfp.jpg', online: false, status: 'friend' },
    { id: '5', username: 'CardShark', avatar: '/default-pfp.jpg', online: false, status: 'blocked' },
    { id: '6', username: 'Joker', avatar: '/default-pfp.jpg', online: false, status: 'other' },
  ];
  const onlineCount = onlinePlayers.filter(p => p.online).length;
  const [isPlayerStatsOpen, setIsPlayerStatsOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mobileTab, setMobileTab] = useState<'lobby' | 'chat'>('lobby');
  const navigate = useNavigate();
  const socket = useRef<any>(null);

  // Check if user is new (has 5M coins and 0 games played)
  useEffect(() => {
    if (user && user.coins === 5000000 && user.stats?.gamesPlayed === 0) {
      setShowWelcomeModal(true);
    }
  }, [user]);

  useEffect(() => {
    socket.current = socketIOClient('http://localhost:3001');
    socket.current.on('games_updated', (updatedGames: Game[]) => {
      setGames(updatedGames);
      setIsLoading(false);
    });
    socket.current.on('lobby_chat_message', (msg: ChatMessage) => {
      setChatMessages(prev => [...prev, msg]);
    });
    return () => {
      socket.current.disconnect();
    };
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const message: ChatMessage = {
      id: Date.now().toString(),
      username: user?.username || 'Anonymous',
      message: newMessage.trim(),
      timestamp: new Date(),
    };

    setChatMessages([...chatMessages, message]);
    setNewMessage('');
    if (socket.current) {
      socket.current.emit('lobby_chat_message', message);
    }
  };

  const handleCreateGame = async (settings: any) => {
    setIsCreateGameModalOpen(false);
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          creatorId: user.id,
          creatorName: user.username,
          creatorImage: user.avatar // or user.image if that's the field
        }),
      });
      if (!res.ok) throw new Error('Failed to create game');
      const game: Game = await res.json();
      navigate(`/table/${game.id}`);
    } catch (err) {
      alert('Failed to create game');
    }
  };

  const filteredGames = games.filter(game => {
    if (filter === 'waiting') return game.status === 'waiting';
    if (filter === 'in-progress') return game.status === 'in-progress';
    return true;
  });

  // Handler to join a game as a player, with seat index
  const handleJoinGame = async (gameId: string, seatIndex: number) => {
    if (!user) return;
    // Ensure user is not null before accessing properties
    const { id, username, avatar } = user;
    const res = await fetch(`/api/games/${gameId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        username,
        avatar,
        seat: seatIndex,
      }),
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
    navigate(`/table/${gameId}`);
  };

  const GameTile: React.FC<{ game: Game }> = ({ game }) => {
    return (
      <div className="bg-slate-800 rounded-lg p-4 hover:bg-slate-750 transition relative overflow-visible">
        {/* Game settings header */}
        <div className="flex items-center gap-2 text-sm mb-4">
          <span className="text-slate-200 font-medium">{game.gameMode}</span>
          <span className="text-slate-300">{game.minPoints}/{game.maxPoints}</span>
          <span className="text-slate-300">nil ☑️</span>
          <span className="text-slate-300">bn ❌</span>
        </div>
        {/* Absolutely positioned rule labels */}
        <div className="absolute top-4 right-4 flex flex-col items-end space-y-1 z-20">
          {game.forcedBid === 'SUICIDE' && (
            <div className="inline-block bg-pink-600 text-white text-xs px-2 py-0.5 rounded font-semibold shadow">
              SUICIDE
            </div>
          )}
          {game.specialRules.screamer && (
            <div className="inline-block bg-indigo-600 text-white text-xs px-2 py-0.5 rounded font-semibold shadow">
              SCREAMER
            </div>
          )}
          {game.specialRules.assassin && (
            <div className="inline-block bg-green-600 text-white text-xs px-2 py-0.5 rounded font-semibold shadow">
              ASSASSIN
            </div>
          )}
        </div>
        {/* Coin value, no extra margin or z-index */}
        <div className="flex items-center gap-1 mb-4">
          <span className="text-yellow-500 text-lg font-bold">
            {(game.buyIn / 1000).toFixed(0)}k
          </span>
          <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        {/* Table visualization, no negative margin */}
        <div className="relative h-44 mb-2">
          {/* Table background */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-28 bg-slate-700 rounded-full" />
          
          {/* Seats */}
          <div className="absolute inset-0">
            {/* Top seat */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center">
              {game.players[0] ? (
                <div className="text-center flex flex-col items-center">
                  <img 
                    src={game.players[0].avatar} 
                    alt="" 
                    className="w-16 h-16 rounded-full border-2 border-slate-600" 
                  />
                  <span className="text-xs text-slate-200 -mt-1 block bg-slate-800/80 px-2 py-0.5 rounded-full">
                    {game.players[0].username}
                  </span>
                </div>
              ) : (
                <button className="w-16 h-16 rounded-full bg-slate-600 border border-slate-300 text-slate-200 text-base flex items-center justify-center hover:bg-slate-500 transition" onClick={() => handleJoinGame(game.id, 0)}>
                  JOIN
                </button>
              )}
            </div>
            
            {/* Right seat */}
            <div className="absolute right-8 top-1/2 -translate-y-1/2 flex flex-col items-center">
              {game.players[1] ? (
                <div className="text-center flex flex-col items-center">
                  <img 
                    src={game.players[1].avatar} 
                    alt="" 
                    className="w-16 h-16 rounded-full border-2 border-slate-600" 
                  />
                  <span className="text-xs text-slate-200 -mt-1 block bg-slate-800/80 px-2 py-0.5 rounded-full">
                    {game.players[1].username}
                  </span>
                </div>
              ) : (
                <button className="w-16 h-16 rounded-full bg-slate-600 border border-slate-300 text-slate-200 text-base flex items-center justify-center hover:bg-slate-500 transition" onClick={() => handleJoinGame(game.id, 1)}>
                  JOIN
                </button>
              )}
            </div>
            
            {/* Bottom seat */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center">
              {game.players[2] ? (
                <div className="text-center flex flex-col items-center">
                  <img 
                    src={game.players[2].avatar} 
                    alt="" 
                    className="w-16 h-16 rounded-full border-2 border-slate-600" 
                  />
                  <span className="text-xs text-slate-200 -mt-1 block bg-slate-800/80 px-2 py-0.5 rounded-full">
                    {game.players[2].username}
                  </span>
                </div>
              ) : (
                <button className="w-16 h-16 rounded-full bg-slate-600 border border-slate-300 text-slate-200 text-base flex items-center justify-center hover:bg-slate-500 transition" onClick={() => handleJoinGame(game.id, 2)}>
                  JOIN
                </button>
              )}
            </div>
            
            {/* Left seat */}
            <div className="absolute left-8 top-1/2 -translate-y-1/2 flex flex-col items-center">
              {game.players[3] ? (
                <div className="text-center flex flex-col items-center">
                  <img 
                    src={game.players[3].avatar} 
                    alt="" 
                    className="w-16 h-16 rounded-full border-2 border-slate-600" 
                  />
                  <span className="text-xs text-slate-200 -mt-1 block bg-slate-800/80 px-2 py-0.5 rounded-full">
                    {game.players[3].username}
                  </span>
                </div>
              ) : (
                <button className="w-16 h-16 rounded-full bg-slate-600 border border-slate-300 text-slate-200 text-base flex items-center justify-center hover:bg-slate-500 transition" onClick={() => handleJoinGame(game.id, 3)}>
                  JOIN
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-400">
            {game.status === 'waiting' ? 'WAITING' : 'IN PROGRESS'}
          </span>
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
  const handleOpenPlayerStats = (player: any) => {
    setSelectedPlayer({
      username: player.username,
      avatar: player.avatar,
      stats: player.stats || {
        gamesPlayed: 0,
        gamesWon: 0,
        nilsBid: 0,
        nilsMade: 0,
        blindNilsBid: 0,
        blindNilsMade: 0,
      },
      status: player.status,
      coins: player.coins,
    });
    setIsPlayerStatsOpen(true);
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
                onClick={() => setFilter('all')}
                className={`px-3 py-1 rounded-md ${
                  filter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                All Games
              </button>
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
                  {chatMessages.map(msg => (
                    <div key={msg.id} className="bg-slate-700 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-indigo-400">{msg.username}</span>
                        <span className="text-xs text-slate-400">
                          {msg.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-slate-200 mt-1">{msg.message}</p>
                    </div>
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
                      // Always show online first
                      if (b.online !== a.online) return Number(b.online) - Number(a.online);
                      // For 'all', put blocked at the bottom
                      if (playerFilter === 'all') {
                        if (a.status === 'blocked' && b.status !== 'blocked') return 1;
                        if (b.status === 'blocked' && a.status !== 'blocked') return -1;
                      }
                      return 0;
                    })
                    .map(player => (
                      <div key={player.id} className="flex items-center gap-3 p-2 rounded bg-slate-700">
                        <img src={player.avatar} alt="" className="w-8 h-8 rounded-full border-2 border-slate-600" />
                        <span
                          className={`text-sm font-medium ${player.online ? 'text-green-400' : 'text-slate-300'} flex items-center cursor-pointer hover:underline`}
                          onClick={() => handleOpenPlayerStats(player)}
                        >
                          {player.username}
                          {player.online && <span className="ml-2 inline-block w-2 h-2 bg-green-500 rounded-full"></span>}
                          {player.status === 'friend' && (
                            <img src="/friend.svg" alt="Friend" className="ml-2 w-6 h-6" style={{ filter: 'invert(1) brightness(2)' }} />
                          )}
                        </span>
                        <div className="flex gap-2 ml-auto items-center">
                          {player.status === 'blocked' ? (
                            <>
                              <span className="text-slate-400 text-xs mr-2 flex items-center h-8">unblock?</span>
                              <button className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-600 border border-slate-300 hover:bg-slate-500" title="Unblock">
                                {/* Unblock: circle with slash */}
                                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                                  <circle cx="12" cy="12" r="11" stroke="white" strokeWidth="2" />
                                  <path d="M6 18L18 6" stroke="white" strokeWidth="2.5" />
                                </svg>
                              </button>
                            </>
                          ) : (
                            <>
                              {player.status === 'friend' ? (
                                <>
                                  <button className="w-8 h-8 flex items-center justify-center rounded-full bg-red-600 border border-slate-300 hover:bg-red-700" title="Remove Friend">
                                    <img src="/remove-friend.svg" alt="Remove Friend" className="w-5 h-5" style={{ filter: 'invert(1) brightness(2)' }} />
                                  </button>
                                  <button className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-600 border border-slate-300 hover:bg-slate-500" title="Block">
                                    {/* Block: circle with X, X touches the circle */}
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
                                    {/* Block: circle with X, X touches the circle */}
                                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                                      <circle cx="12" cy="12" r="11" stroke="white" strokeWidth="2" />
                                      <path d="M4 4L20 20M20 4L4 20" stroke="white" strokeWidth="2.5" />
                                    </svg>
                                  </button>
                                </>
                              )}
                            </>
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
        onClose={() => setShowWelcomeModal(false)}
      />

      <PlayerStatsModal
        isOpen={isPlayerStatsOpen}
        onClose={() => setIsPlayerStatsOpen(false)}
        player={selectedPlayer}
      />
    </div>
  );
};

export default HomePage; 