"use client";

import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { Player } from '../types/game';

interface ChatProps {
  gameId: string;
  userId: string;
  userName: string;
  players: Player[];
  spectators?: Player[];
  userAvatar?: string;
  showPlayerListTab?: boolean;
  chatType?: 'game' | 'lobby';
  onToggleChatType?: () => void;
  lobbyMessages?: ChatMessage[];
  isSpectator?: boolean;
}

// Export the ChatMessage interface
export interface ChatMessage {
  id?: string;
  userId: string;
  userName: string;
  message: string;
  text?: string; // For compatibility with existing code
  user?: string; // For compatibility with existing code
  timestamp: number;
  isGameMessage?: boolean;
}

// Fallback avatars 
const GUEST_AVATAR = "/guest-avatar.png";
const BOT_AVATAR = "/bot-avatar.jpg";

// Add proper type for emoji parameter
interface EmojiData {
  native: string;
}

// Add EyeIcon SVG component
const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block w-5 h-5 ml-1 align-middle"><path d="M12 5C5.63636 5 2 12 2 12C2 12 5.63636 19 12 19C18.3636 19 22 12 22 12C22 12 18.3636 5 12 5Z" stroke="#888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path><path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="#888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path></svg>
);

export default function Chat({ gameId, userId, userName, players, spectators, userAvatar, showPlayerListTab = true, chatType = 'game', onToggleChatType, lobbyMessages, isSpectator = false }: ChatProps) {
  const { socket, isAuthenticated, isConnected, isReady } = useSocket();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'players'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [scaleFactor, setScaleFactor] = useState(1);
  const [isMobile, setIsMobile] = useState(false);

  // Debug emoji data
  useEffect(() => {
    console.log('Emoji data loaded:', data);
  }, []);

  // Add responsive sizing state
  const [screenSize, setScreenSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });

  // Add responsive sizing effect
  useEffect(() => {
    const handleResize = () => {
      setScreenSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Calculate scale factor based on screen size
  const getScaleFactor = () => {
    if (screenSize.width < 640) {
      return 0.8;
    } else if (screenSize.width < 768) {
      return 0.9;
    }
    return 1;
  };

  // Update scale factor when screen size changes
  useEffect(() => {
    setScaleFactor(getScaleFactor());
    setIsMobile(screenSize.width < 640);
  }, [screenSize]);

  // Calculate font sizes based on scale factor
  const fontSize = 14 * scaleFactor;
  const mobileFontSize = isMobile ? 11 : fontSize;

  useEffect(() => {
    console.log('Chat useEffect: socket state:', { 
      hasSocket: !!socket, 
      isConnected, 
      isAuthenticated,
      isReady,
      chatType
    });

    if (!socket || !isReady) {
      console.log('No active socket available for chat or not authenticated');
      return;
    }

    // Set up message handler
    const handleMessage = (data: ChatMessage | { gameId: string; message: ChatMessage }) => {
      console.log('Chat: Received message:', data);
      
      // Handle game chat messages
      if (chatType === 'game') {
        if (!('gameId' in data)) {
          console.error('Invalid game chat message format:', data);
          return;
        }
        const message = data.message;
        
        // Debug logging for message details
        console.log('Chat: Message details:', {
          userId: message.userId,
          userName: message.userName,
          message: message.message,
          timestamp: message.timestamp
        });
        
        // Handle system messages
        if (message.userId === 'system') {
          console.log('Chat: Received system message:', message);
          setMessages(prev => [...prev, {
            ...message,
            id: message.id || `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: message.timestamp || Date.now(),
            userName: 'System'
          }]);
          return;
        }

        // Handle player messages
        setMessages(prev => [...prev, {
          ...message,
          id: message.id || `${message.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: message.timestamp || Date.now()
        }]);
      } 
      // Handle lobby chat messages
      else {
        if ('gameId' in data) {
          console.error('Invalid lobby chat message format:', data);
          return;
        }
        const message = data as ChatMessage;
        setMessages(prev => [...prev, {
          ...message,
          id: message.id || `${message.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: message.timestamp || Date.now()
        }]);
      }
    };

    // Set up reconnection handler
    const handleReconnect = () => {
      console.log('Chat: Socket reconnected');
      if (socket && isAuthenticated) {
        if (chatType === 'game') {
          if (isSpectator) {
            socket.emit('join_game_as_spectator', { gameId });
          } else {
          socket.emit('join_game', { gameId });
          }
        }
      }
    };

    // Set up connection handlers
    const onConnect = () => {
      console.log('Chat: Socket connected');
      if (socket && isAuthenticated) {
        if (chatType === 'game') {
          if (isSpectator) {
            socket.emit('join_game_as_spectator', { gameId });
          } else {
          socket.emit('join_game', { gameId });
          }
        }
      }
    };

    const onDisconnect = () => {
      console.log('Chat: Socket disconnected');
    };

    const onError = (err: Error) => {
      console.error('Chat: Socket error:', err);
    };

    // Set up event listeners based on chat type
    if (socket) {
      console.log('Chat: Setting up event listeners for', chatType, 'chat, isSpectator:', isSpectator);
      
      if (chatType === 'game') {
        console.log('Chat: Registering chat_message event listener');
        socket.on('chat_message', handleMessage);
      } else {
        console.log('Chat: Registering lobby_chat_message event listener');
        socket.on('lobby_chat_message', handleMessage);
      }
      
      socket.on('reconnect', handleReconnect);
      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);
      socket.on('error', onError);

      // Join the game room if needed
      if (isAuthenticated && chatType === 'game') {
        console.log('Chat: Joining game:', gameId, 'as', isSpectator ? 'spectator' : 'player');
        // Only join as spectator if user is actually a spectator
        if (isSpectator) {
          socket.emit('join_game_as_spectator', { gameId });
        }
        // If user is a player, they should already be in the game room from the main game join
      }
    }

    return () => {
      if (socket) {
        console.log('Chat: Cleaning up event listeners for', chatType, 'chat, isSpectator:', isSpectator);
        
        if (chatType === 'game') {
          console.log('Chat: Removing chat_message event listener');
          socket.off('chat_message', handleMessage);
        } else {
          console.log('Chat: Removing lobby_chat_message event listener');
          socket.off('lobby_chat_message', handleMessage);
        }
        socket.off('reconnect', handleReconnect);
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
        socket.off('error', onError);
      }
    };
  }, [socket, isAuthenticated, isConnected, isReady, gameId, chatType, isSpectator]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !socket || (!isReady && chatType === 'game')) {
      console.log('Cannot send message - socket not ready:', { isConnected, isAuthenticated, isReady, chatType });
      return;
    }

    const message: ChatMessage = {
      id: `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      userName,
      message: newMessage.trim(),
      timestamp: Date.now(),
      isGameMessage: chatType === 'game'
    };

    try {
      console.log('Sending chat message:', { chatType, gameId, message, isSpectator });
      console.log('Current socket state:', { 
        socketId: socket.id, 
        isConnected: socket.connected
      });
      
      if (chatType === 'game') {
        socket.emit('chat_message', { gameId, message });
      } else {
        socket.emit('lobby_chat_message', message);
      }
      setNewMessage('');
    } catch (error) {
      console.error('Failed to send chat message:', error);
    }
  };

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const playerColors: Record<string, string> = {};
  players.forEach(player => {
    playerColors[player.id] = player.team === 1 ? 'text-red-400' : 'text-blue-400';
  });

  // Add state for lobby chat if needed
  const [lobbyInputValue, setLobbyInputValue] = useState('');
  const [showLobbyEmojiPicker, setShowLobbyEmojiPicker] = useState(false);
  const lobbyMessagesEndRef = useRef<HTMLDivElement>(null);

  // Use correct socket/messages depending on chatType
  const isLobby = chatType === 'lobby';
  const activeMessages = isLobby && lobbyMessages ? lobbyMessages : messages;

  // Scroll to bottom for lobby chat
  useEffect(() => {
    if (isLobby && lobbyMessagesEndRef.current) {
      lobbyMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isLobby, lobbyMessages]);

  // Handle lobby chat send
  const handleLobbySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lobbyInputValue.trim() || !socket || !isAuthenticated) {
      console.log('Cannot send lobby message - socket not ready:', { connected: socket?.connected, authenticated: isAuthenticated });
      return;
    }
    try {
      const messageId = `${Date.now()}-${userId}-${Math.random().toString(36).substr(2, 9)}`;
      const chatMessage: ChatMessage = {
        id: messageId,
        userName: userName,
        userId: userId,
        message: lobbyInputValue.trim(),
        timestamp: Date.now()
      };
      // Optimistic UI: parent should update lobbyMessages
      socket.emit('lobby_chat_message', chatMessage);
      setLobbyInputValue('');
      setShowLobbyEmojiPicker(false);
    } catch (err) {
      console.error('Failed to send lobby chat message:', err);
    }
  };

  // Get a player's avatar - updated to match GameTable.tsx logic
  const getPlayerAvatar = (playerId: string): string => {
    // Find the player in the players array
    const player = players.find(p => p.id === playerId);
    
    // Check for avatar property first (most common)
    if (player && player.avatar) {
      return player.avatar;
    }
    
    // Check for image property as fallback
    if (player && 'image' in player && player.image) {
      return player.image as string;
    }
    
    // Check if it's a spectator
    const spectator = spectators?.find(s => s.id === playerId);
    if (spectator && spectator.avatar) {
      return spectator.avatar;
    }
    
    // Discord user ID (numeric string)
    if (playerId && /^\d+$/.test(playerId)) {
      // For Discord users without an avatar hash or with invalid avatar, use the default Discord avatar
      return `https://cdn.discordapp.com/embed/avatars/${parseInt(playerId) % 5}.png`;
    }
    
    // Guest user, use default avatar
    if (playerId && playerId.startsWith('guest_')) {
      return GUEST_AVATAR;
    }
    
    // Fallback to bot avatar
    return BOT_AVATAR;
  };

  useEffect(() => {
    if (!socket || !isAuthenticated) return;
    const logAll = (event: string, ...args: unknown[]) => {
      console.log('SOCKET EVENT:', event, ...args);
    };
    socket.onAny(logAll);
    return () => {
      socket.offAny(logAll);
    };
  }, [socket, isAuthenticated]);

  return (
    <div className="flex flex-col h-full bg-gray-800 border-l border-gray-600">
      {/* Chat/Players Header */}
      <div className="flex items-center justify-between bg-gray-900 p-2 border-b border-gray-600">
        <div className="flex items-center gap-2">
          <button
            className={`w-20 h-10 flex items-center justify-center rounded-md text-sm font-semibold transition ${activeTab === 'chat' ? 'bg-indigo-600' : 'bg-slate-700'}`}
            onClick={() => setActiveTab('chat')}
            aria-label="Chat"
          >
            <img src="/chat.svg" alt="Chat" className="w-6 h-6" style={{ filter: 'invert(1) brightness(2)' }} />
          </button>
          {showPlayerListTab && (
            <button
              className={`w-20 h-10 flex items-center justify-center rounded-md text-sm font-semibold transition ${activeTab === 'players' ? 'bg-indigo-600' : 'bg-slate-700'}`}
              onClick={() => setActiveTab('players')}
              aria-label="Players"
            >
              <img src="/players.svg" alt="Players" className="w-6 h-6" style={{ filter: 'invert(1) brightness(2)' }} />
            </button>
          )}
        </div>
        {/* Toggle switch for chat type */}
        {onToggleChatType && (
          <div className="flex items-center gap-2 pr-4">
            <span className="text-xs font-semibold text-indigo-400">{isLobby ? 'Lobby' : 'Game'}</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={isLobby} onChange={onToggleChatType} className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:bg-indigo-600 transition-all"></div>
              <div className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${isLobby ? 'translate-x-5' : ''}`}></div>
            </label>
          </div>
        )}
      </div>
      {/* Tab Content */}
      {activeTab === 'chat' ? (
        <>
          {/* Messages container - flex-grow to fill available space */}
          <div className="flex-grow overflow-y-auto p-2 bg-gray-850" style={{ backgroundColor: '#1a202c' }}>
            {activeMessages.length === 0 ? (
              <div className="text-gray-400 text-center my-4" style={{ fontSize: `${mobileFontSize}px` }}>
                No messages yet. Start the conversation!
              </div>
            ) : (
              activeMessages.map((msg, index) => (
                msg.userId === 'system' ? (
                  <div
                    key={msg.id || index}
                    className="w-full text-center my-2"
                  >
                    <span className="text-orange-400 italic flex items-center justify-center gap-1" style={{ fontSize: `${mobileFontSize + 2}px` }}>
                      {msg.message || msg.text}
                      {(msg.message || msg.text)?.includes('joined the game') && spectators?.some(s => (msg.message || msg.text)?.includes(s.username || s.name)) && <EyeIcon />}
                    </span>
                  </div>
                ) : (
                  <div
                    key={msg.id || index}
                    className={`mb-2 flex items-start ${msg.userId === userId ? 'justify-end' : ''}`}
                  >
                    {msg.userId !== userId && (
                      <div className={`w-${isMobile ? '6' : '8'} h-${isMobile ? '6' : '8'} mr-2 rounded-full overflow-hidden flex-shrink-0`}>
                        <img 
                          src={getPlayerAvatar(msg.userId)} 
                          alt={msg.userName || msg.user || ''} 
                          width={isMobile ? 24 : 32} 
                          height={isMobile ? 24 : 32}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className={`max-w-[80%] ${msg.userId === userId ? 'bg-blue-600 text-white' : 'bg-gray-700 text-white'} rounded-lg px-${isMobile ? '2' : '3'} py-${isMobile ? '1' : '2'}`}> 
                      <div className="flex justify-between items-center mb-1">
                        {msg.userId !== userId && (
                          <span className="font-medium text-xs opacity-80" style={{ fontSize: isMobile ? '9px' : '' }}>{msg.userName || msg.user}</span>
                        )}
                        <span className="text-xs opacity-75 ml-auto" style={{ fontSize: isMobile ? '9px' : '' }}> {formatTime(msg.timestamp)}</span>
                      </div>
                      <p style={{ fontSize: `${mobileFontSize}px` }}>{msg.message || msg.text}</p>
                    </div>
                    {msg.userId === userId && (
                      <div className={`w-${isMobile ? '6' : '8'} h-${isMobile ? '6' : '8'} ml-2 rounded-full overflow-hidden flex-shrink-0`}>
                        <img 
                          src={userAvatar || getPlayerAvatar(msg.userId)} 
                          alt={msg.userName || msg.user || ''} 
                          width={isMobile ? 24 : 32} 
                          height={isMobile ? 24 : 32}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                )
              ))
            )}
            {isLobby && <div ref={lobbyMessagesEndRef} />}
            {!isLobby && <div ref={messagesEndRef} />}
          </div>
          {/* Message input */}
          {isLobby ? (
            <form onSubmit={handleLobbySubmit} className="p-2 bg-gray-900 flex border-t border-gray-600">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={lobbyInputValue}
                  onChange={(e) => setLobbyInputValue(e.target.value)}
                  placeholder={screenSize.width < 640 ? "Type..." : "Type a message..."}
                  className="bg-gray-700 text-white rounded-l w-full px-3 py-2 outline-none border-0"
                  style={{ fontSize: `${fontSize}px` }}
                />
                <button
                  type="button"
                  onClick={() => setShowLobbyEmojiPicker(!showLobbyEmojiPicker)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xl text-yellow-300 hover:text-yellow-200"
                >
                  😊
                </button>
                {showLobbyEmojiPicker && (
                  <div className="fixed bottom-20 right-4 z-50" style={{ maxHeight: '400px', minHeight: '300px' }}>
                    <Picker
                      data={data}
                      onEmojiSelect={(emoji: EmojiData) => {
                        console.log('Emoji selected:', emoji);
                        setLobbyInputValue(prev => prev + emoji.native);
                      }}
                      theme="dark"
                      set="native"
                      previewPosition="none"
                      skinTonePosition="none"
                      autoFocus
                      maxFrequentRows={4}
                      maxSearchResults={20}
                    />
                  </div>
                )}
              </div>
              <button
                type="submit"
                className="bg-blue-600 text-white rounded-r hover:bg-blue-700 flex items-center justify-center w-10"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                </svg>
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="p-2 bg-gray-900 flex border-t border-gray-600">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder={screenSize.width < 640 ? "Type..." : "Type a message..."}
                  className="bg-gray-700 text-white rounded-l w-full px-3 py-2 outline-none border-0"
                  style={{ fontSize: `${fontSize}px` }}
                />
                <button
                  type="button"
                  onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xl text-yellow-300 hover:text-yellow-200"
                >
                  😊
                </button>
                {isEmojiPickerOpen && (
                  <div className="fixed bottom-20 right-4 z-50" style={{ maxHeight: '400px', minHeight: '300px' }}>
                    <Picker
                      data={data}
                      onEmojiSelect={(emoji: EmojiData) => {
                        console.log('Emoji selected:', emoji);
                        setNewMessage(prev => prev + emoji.native);
                      }}
                      theme="dark"
                      set="native"
                      previewPosition="none"
                      skinTonePosition="none"
                      autoFocus
                      maxFrequentRows={4}
                      maxSearchResults={20}
                    />
                  </div>
                )}
              </div>
              <button
                type="submit"
                className="bg-blue-600 text-white rounded-r hover:bg-blue-700 flex items-center justify-center w-10"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                </svg>
              </button>
            </form>
          )}
        </>
      ) : (
        // Player List Tab
        <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-gray-850" style={{ backgroundColor: '#1a202c' }}>
          {players.length === 0 && (!spectators || spectators.length === 0) && (
            <div className="text-center text-gray-400 py-4">No players found.</div>
          )}
          {/* Seated players */}
          {players.map(player => (
            <div key={player.id} className="flex items-center gap-3 p-2 rounded bg-slate-700">
              <img src={player.avatar || player.image || '/bot-avatar.jpg'} alt="" className="w-8 h-8 rounded-full border-2 border-slate-600" />
              <span className="text-sm font-medium text-slate-200 flex items-center">
                {player.username || player.name}
              </span>
            </div>
          ))}
          {/* Spectators */}
          {spectators && spectators.map(spectator => (
            <div key={spectator.id} className="flex items-center gap-3 p-2 rounded bg-slate-700 opacity-80">
              <img src={spectator.avatar || spectator.image || '/guest-avatar.png'} alt="" className="w-8 h-8 rounded-full border-2 border-slate-600" />
              <span className="text-sm font-medium text-slate-200 flex items-center">
                {spectator.username || spectator.name}
                <EyeIcon />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 