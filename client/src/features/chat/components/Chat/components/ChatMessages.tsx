// Chat messages display component
// Extracted from Chat.tsx

import React, { useRef, useEffect } from 'react';
import type { ChatMessage } from "../../../chat/Chat";

interface ChatMessagesProps {
  messages: ChatMessage[];
  isMobile: boolean;
  scaleFactor: number;
  userAvatar?: string;
  currentUserId?: string;
  onPlayerClick?: (player: any) => void;
  playerStatuses: Record<string, 'friend' | 'blocked' | 'not_friend'>;
  onAddFriend: (playerId: string) => void;
  onRemoveFriend: (playerId: string) => void;
  onBlockUser: (playerId: string) => void;
  onUnblockUser: (playerId: string) => void;
}

// Fallback avatars 
const GUEST_AVATAR = "/guest-avatar.png";
const BOT_AVATAR = "/bot-avatar.jpg";

// Add EyeIcon SVG component
const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block w-5 h-5 ml-1 align-middle">
    <path d="M12 5C5.63636 5 2 12 2 12C2 12 5.63636 19 12 19C18.3636 19 22 12 22 12C22 12 18.3636 5 12 5Z" stroke="#888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path>
    <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="#888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path>
  </svg>
);

export const ChatMessages: React.FC<ChatMessagesProps> = ({
  messages,
  isMobile,
  scaleFactor,
  userAvatar,
  currentUserId,
  onPlayerClick,
  playerStatuses,
  onAddFriend,
  onRemoveFriend,
  onBlockUser,
  onUnblockUser
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Calculate font sizes based on scale factor
  const getFontSizes = () => {
    const baseSize = isMobile ? 12 : 14;
    return {
      messageText: `${Math.floor(baseSize * scaleFactor)}px`,
      timestamp: `${Math.floor((baseSize - 2) * scaleFactor)}px`,
      username: `${Math.floor((baseSize - 1) * scaleFactor)}px`
    };
  };

  const fontSizes = getFontSizes();

  const formatTimestamp = (timestamp: number | string) => {
    const date = new Date(typeof timestamp === 'string' ? parseInt(timestamp) : timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getPlayerStatus = (userId: string) => {
    return playerStatuses[userId] || 'not_friend';
  };

  const handlePlayerAction = (action: string, playerId: string, playerName: string) => {
    if (action === 'add_friend') {
      onAddFriend(playerId);
    } else if (action === 'remove_friend') {
      onRemoveFriend(playerId);
    } else if (action === 'block_user') {
      onBlockUser(playerId);
    } else if (action === 'unblock_user') {
      onUnblockUser(playerId);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col gap-y-4 p-4" style={{ maxHeight: 'calc(100vh - 200px)' }}>
      {messages.map((message, index) => {
        const isSystemMessage = message.userId === 'system';
        const isCurrentUser = currentUserId ? message.userId === currentUserId : false;
        
        if (isSystemMessage) {
          return (
            <div
              key={message.id || index}
              className="w-full text-center my-2"
            >
              <span className="text-orange-400 flex items-center justify-center gap-1">
                {message.message}
              </span>
            </div>
          );
        }
        
        return (
          <div
            key={message.id || index}
            className={`mb-2 flex items-start ${isCurrentUser ? 'justify-end' : ''}`}
          >
            {!isCurrentUser && (
              <div className={`w-8 h-8 mr-2 rounded-full overflow-hidden flex-shrink-0`}>
                <img 
                  src={message.userAvatar || GUEST_AVATAR} 
                  alt={message.userName || ''} 
                  width={32}
                  height={32}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = GUEST_AVATAR;
                  }}
                />
              </div>
            )}
            <div className={`max-w-[80%] ${isCurrentUser ? 'bg-blue-600 text-white' : 'bg-gray-700 text-white'} rounded-lg px-3 py-2`}>
              <div className="flex justify-between items-center mb-1">
                {!isCurrentUser && (
                  <span className="font-medium text-xs opacity-80">{message.userName}</span>
                )}
                <span className="text-xs opacity-75 ml-auto"> {formatTimestamp(message.timestamp)}</span>
              </div>
              <p>{message.message}</p>
            </div>
            {isCurrentUser && (
              <div className={`w-8 h-8 ml-2 rounded-full overflow-hidden flex-shrink-0`}>
                <img 
                  src={userAvatar || GUEST_AVATAR} 
                  alt="You" 
                  width={32}
                  height={32}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = GUEST_AVATAR;
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
};
