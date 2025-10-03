// Chat header component with tab switching and chat type toggle
// Extracted from Chat.tsx

import React from 'react';

interface ChatHeaderProps {
  activeTab: 'chat' | 'players';
  onTabChange: (tab: 'chat' | 'players') => void;
  showPlayerListTab: boolean;
  onToggleChatType?: () => void;
  chatType: 'game' | 'lobby';
  isMobile: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  activeTab,
  onTabChange,
  showPlayerListTab,
  onToggleChatType,
  chatType,
  isMobile
}) => {
  return (
    <div className="flex items-center justify-between bg-gray-900 p-2 border-b border-gray-600">
      <div className="flex items-center gap-2">
        <button
          className={`${isMobile ? 'w-12 h-8' : 'w-20 h-10'} flex items-center justify-center rounded-md text-sm font-semibold transition ${activeTab === 'chat' ? 'bg-indigo-600' : 'bg-slate-700'}`}
          onClick={() => onTabChange('chat')}
          aria-label="Chat"
        >
          <img src="/chat.svg" alt="Chat" className={`${isMobile ? 'w-4 h-4' : 'w-6 h-6'}`} style={{ filter: 'invert(1) brightness(2)' }} />
        </button>
        {showPlayerListTab && (
          <button
            className={`${isMobile ? 'w-12 h-8' : 'w-20 h-10'} flex items-center justify-center rounded-md text-sm font-semibold transition ${activeTab === 'players' ? 'bg-indigo-600' : 'bg-slate-700'}`}
            onClick={() => onTabChange('players')}
            aria-label="Players"
          >
            <img src="/players.svg" alt="Players" className={`${isMobile ? 'w-4 h-4' : 'w-6 h-6'}`} style={{ filter: 'invert(1) brightness(2)' }} />
          </button>
        )}
        
        {/* Toggle switch for chat type */}
        {onToggleChatType && (
          <div className="flex items-center gap-2 ml-2">
            <span className={`text-xs ${isMobile ? 'text-xs' : 'text-sm'} text-gray-300`}>
              {chatType === 'game' ? 'Game' : 'Lobby'}
            </span>
            <button
              onClick={onToggleChatType}
              className={`relative inline-flex ${isMobile ? 'h-5 w-9' : 'h-6 w-11'} items-center rounded-full transition-colors ${
                chatType === 'game' ? 'bg-indigo-600' : 'bg-gray-600'
              }`}
              aria-label={`Switch to ${chatType === 'game' ? 'lobby' : 'game'} chat`}
            >
              <span
                className={`inline-block ${isMobile ? 'h-4 w-4' : 'h-5 w-5'} transform rounded-full bg-white transition-transform ${
                  chatType === 'game' ? (isMobile ? 'translate-x-4' : 'translate-x-5') : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
