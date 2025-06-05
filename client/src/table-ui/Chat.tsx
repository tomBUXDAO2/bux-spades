"use client";

import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { Player } from '../types/game';
import { socketApi } from './lib/socketApi';

interface ChatProps {
  gameId: string;
  userId: string;
  userName: string;
  players: Player[];
  showPlayerListTab?: boolean;
  chatType?: 'game' | 'lobby';
  onToggleChatType?: () => void;
  lobbyMessages?: ChatMessage[];
}

interface ChatMessage {
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

export default function Chat({ gameId, userId, userName, players, showPlayerListTab = true, chatType = 'game', onToggleChatType, lobbyMessages }: ChatProps) {
  const socket = useSocket();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Add responsive sizing state
  const [screenSize, setScreenSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800
  });

  // Listen for screen size changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleResize = () => {
      setScreenSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Calculate scale factor for responsive sizing
  const getScaleFactor = () => {
    // Base scale on the screen width compared to a reference size
    const referenceWidth = 1200; // Reference width for desktop
    let scale = Math.min(1, screenSize.width / referenceWidth);
    
    // Minimum scale to ensure things aren't too small
    return Math.max(0.65, scale);
  };
  
  const scaleFactor = getScaleFactor();
  
  // Font sizes based on scale
  const fontSize = Math.max(12, Math.floor(14 * scaleFactor));
  
  // Mobile detection
  const isMobile = screenSize.width < 640;
  const mobileFontSize = isMobile ? 11 : fontSize;

  const activeSocket = socket;
  
  // Track connection status
  useEffect(() => {
    if (!activeSocket) {
      console.log('No active socket available for chat');
      return;
    }
    
    console.log('Setting up chat message listeners for game:', gameId);
    
    const handleMessage = (data: any) => {
      console.log('SOCKET MESSAGE RECEIVED:', JSON.stringify(data));
      // Handle different message formats
      let chatMessage: ChatMessage;
      if (data.message && typeof data.message === 'object') {
        chatMessage = data.message;
        console.log('Extracted message from wrapper:', chatMessage);
      } else if (data.userId || data.user) {
        chatMessage = data;
        console.log('Using direct message object:', chatMessage);
      } else {
        console.error('Unrecognized chat message format:', data);
        return;
      }
      // Force system message fields
      if (chatMessage.userId === 'system' || chatMessage.isGameMessage) {
        chatMessage.userId = 'system';
        chatMessage.userName = 'System';
        chatMessage.isGameMessage = true;
      }
      // Ensure message has an ID and timestamp
      if (!chatMessage.id) {
        chatMessage.id = `${Date.now()}-${chatMessage.userId || 'server'}-${Math.random().toString(36).substr(2, 9)}`;
      }
      if (!chatMessage.timestamp) {
        chatMessage.timestamp = Date.now();
      }
      // Remove filtering that blocks system messages
      // Add to state and log
      setMessages(prev => {
        if (chatMessage.id && prev.some(m => m.id === chatMessage.id)) {
          console.log('Duplicate message detected, skipping:', chatMessage.id);
          return prev;
        }
        const newMessages = [...prev, chatMessage];
        if (newMessages.length > 100) {
          console.log('ADDING TO CHAT STATE (truncated):', chatMessage);
          return newMessages.slice(-100);
        }
        console.log('ADDING TO CHAT STATE:', chatMessage);
        return newMessages;
      });
    };

    // Listen for direct chat messages
    activeSocket.on('chat_message', handleMessage);
    console.log('Registered chat_message listener');
    
    // Some servers might use this event name instead
    activeSocket.on('chat', handleMessage);
    console.log('Registered chat listener');

    // Handle socket reconnection
    activeSocket.on('connect', () => {
      console.log('Chat socket reconnected, joining game room:', gameId);
      if (activeSocket && typeof activeSocket === 'object') {
        activeSocket.emit('join_game', {
          gameId,
          userId,
          watchOnly: true
        });
        console.log('Emitted join_game event after reconnection');
      }
    });

    return () => {
      console.log('Cleaning up chat message listeners');
      activeSocket.off('chat_message', handleMessage);
      activeSocket.off('chat', handleMessage);
      activeSocket.off('connect');
    };
  }, [activeSocket, gameId, userId]);

  // Track connection status
  useEffect(() => {
    if (!activeSocket) return;
    
    const onConnect = () => {
      console.log('Chat socket connected to game:', gameId);
      
      // Explicitly join the game room when connected
      if (activeSocket && typeof activeSocket === 'object') {
        console.log('Joining game room:', gameId);
        activeSocket.emit('join_game', {
          gameId,
          userId,
          watchOnly: true
        });
      }
    };
    
    const onDisconnect = () => {
      console.log('Chat socket disconnected from game:', gameId);
    };
    
    const onError = (err: any) => {
      console.error('Chat socket error:', err);
    };
    
    activeSocket.on('connect', onConnect);
    activeSocket.on('disconnect', onDisconnect);
    activeSocket.on('connect_error', onError);
    activeSocket.on('error', onError);
    
    // Set initial connection state
    if (activeSocket.connected) {
      console.log('Socket already connected, joining game room:', gameId);
      // Explicitly join the game room if already connected
      if (activeSocket && typeof activeSocket === 'object') {
        activeSocket.emit('join_game', {
          gameId,
          userId,
          watchOnly: true
        });
      }
    }

    return () => {
      activeSocket.off('connect', onConnect);
      activeSocket.off('disconnect', onDisconnect);
      activeSocket.off('connect_error', onError);
      activeSocket.off('error', onError);
    };
  }, [activeSocket, gameId, userId]);

  useEffect(() => {
    // Scroll to bottom whenever messages change
    if (messagesEndRef.current) {
      const shouldAutoScroll = messagesEndRef.current.scrollHeight - messagesEndRef.current.scrollTop <= messagesEndRef.current.clientHeight + 100;
      if (shouldAutoScroll) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !activeSocket) return;

    try {
      // Generate a unique ID for this message
      const messageId = `${Date.now()}-${userId}-${Math.random().toString(36).substr(2, 9)}`;

      const chatMessage = {
        id: messageId,
        userName: userName,
        userId: userId,
        message: inputValue.trim(),
        timestamp: Date.now()
      };

      console.log('Sending chat message:', chatMessage, 'to game:', gameId);
      
      // Add the message to our local state immediately (optimistic UI)
      setMessages(prev => [...prev, chatMessage as ChatMessage]);

      // Send the message using the helper function
      socketApi.sendChatMessage(activeSocket, gameId, chatMessage);

      // Clear the input field
      setInputValue('');
      setShowEmojiPicker(false);
    } catch (err) {
      console.error('Failed to send chat message:', err);
    }
  };

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const playerColors: Record<string, string> = {};
  players.forEach(player => {
    playerColors[player.id] = player.team === 1 ? 'text-red-400' : 'text-blue-400';
  });

  // Add tab state
  const [activeTab, setActiveTab] = useState<'chat' | 'players'>('chat');

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
    if (!lobbyInputValue.trim()) return;
    try {
      const messageId = `${Date.now()}-${userId}-${Math.random().toString(36).substr(2, 9)}`;
      const chatMessage = {
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
    
    // Type guard for image property
    if (player && 'image' in player && player.image) {
      return player.image as string;
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
    if (!activeSocket) return;
    const logAll = (event: string, ...args: unknown[]) => {
      console.log('SOCKET EVENT:', event, ...args);
    };
    activeSocket.onAny(logAll);
    return () => {
      activeSocket.offAny(logAll);
    };
  }, [activeSocket]);

  return (
    <div className="flex flex-col h-full bg-gray-800 overflow-hidden border-l border-gray-600">
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
                <div
                  key={msg.id || index}
                  className={`mb-2 flex items-start ${msg.userId === userId ? 'justify-end' : ''} ${msg.userId === 'system' ? 'justify-center' : ''}`}
                >
                  {msg.userId !== userId && msg.userId !== 'system' && (
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
                  <div className={`max-w-[80%] ${
                    msg.userId === 'system' 
                      ? 'bg-gray-600 text-gray-200 italic' 
                      : msg.userId === userId 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-700 text-white'
                  } rounded-lg px-${isMobile ? '2' : '3'} py-${isMobile ? '1' : '2'}`}>
                    <div className="flex justify-between items-center mb-1">
                      {msg.userId !== userId && msg.userId !== 'system' && (
                        <span className="font-medium text-xs opacity-80" style={{ fontSize: isMobile ? '9px' : '' }}>{msg.userName || msg.user}</span>
                      )}
                      <span className="text-xs opacity-75 ml-auto" style={{ fontSize: isMobile ? '9px' : '' }}>{formatTime(msg.timestamp)}</span>
                    </div>
                    <p style={{ fontSize: `${mobileFontSize}px` }}>{msg.message || msg.text}</p>
                  </div>
                  {msg.userId === userId && (
                    <div className={`w-${isMobile ? '6' : '8'} h-${isMobile ? '6' : '8'} ml-2 rounded-full overflow-hidden flex-shrink-0`}>
                      <img 
                        src={getPlayerAvatar(msg.userId)} 
                        alt={msg.userName || msg.user || ''} 
                        width={isMobile ? 24 : 32} 
                        height={isMobile ? 24 : 32}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>
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
                  <div className="absolute bottom-full right-0 mb-2 z-10">
                    <Picker
                      data={data}
                      onEmojiSelect={(emoji: EmojiData) => setLobbyInputValue(prev => prev + emoji.native)}
                      theme="dark"
                      set="twitter"
                      previewPosition="none"
                      skinTonePosition="none"
                      autoFocus
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
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={screenSize.width < 640 ? "Type..." : "Type a message..."}
                  className="bg-gray-700 text-white rounded-l w-full px-3 py-2 outline-none border-0"
                  style={{ fontSize: `${fontSize}px` }}
                />
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xl text-yellow-300 hover:text-yellow-200"
                >
                  😊
                </button>
                {showEmojiPicker && (
                  <div className="absolute bottom-full right-0 mb-2 z-10">
                    <Picker
                      data={data}
                      onEmojiSelect={(emoji: EmojiData) => setInputValue(prev => prev + emoji.native)}
                      theme="dark"
                      set="twitter"
                      previewPosition="none"
                      skinTonePosition="none"
                      autoFocus
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
          {players.length === 0 && (
            <div className="text-center text-gray-400 py-4">No players found.</div>
          )}
          {players.map(player => (
            <div key={player.id} className="flex items-center gap-3 p-2 rounded bg-slate-700">
              <img src={player.avatar || player.image || '/bot-avatar.jpg'} alt="" className="w-8 h-8 rounded-full border-2 border-slate-600" />
              <span className="text-sm font-medium text-slate-200 flex items-center">
                {player.username || player.name}
              </span>
              {/* No online/friend/block status for now */}
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 