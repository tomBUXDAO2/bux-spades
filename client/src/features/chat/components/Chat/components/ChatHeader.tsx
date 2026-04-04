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
  scaleFactor?: number;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  activeTab,
  onTabChange,
  showPlayerListTab,
  onToggleChatType,
  chatType,
  isMobile,
  scaleFactor = 1
}) => {
  // Scale down for different screen widths
  const screenWidth = window.innerWidth;
  const isSmallScreen = screenWidth >= 600 && screenWidth <= 649;
  const isMediumScreen = screenWidth >= 700 && screenWidth <= 750;
  const scale = isSmallScreen ? 0.8 : isMediumScreen ? 0.85 : 1;
  return (
    <div 
      className="flex items-center justify-between border-b border-white/10 bg-slate-950/60"
      style={{
        padding: `${8 * scale}px`,
        fontSize: `${14 * scale}px`
      }}
    >
      <div className="flex items-center gap-2">
        <button
          className={`flex items-center justify-center rounded-lg font-semibold transition ${
            activeTab === 'chat'
              ? 'bg-gradient-to-r from-cyan-500 to-teal-600 shadow-md shadow-cyan-950/30'
              : 'border border-white/10 bg-white/5 hover:bg-white/10'
          }`}
          style={{
            width: `${(isMobile ? 48 : 80) * scale}px`,
            height: `${(isMobile ? 32 : 40) * scale}px`,
          }}
          onClick={() => onTabChange('chat')}
          aria-label="Chat"
        >
          <img 
            src="/chat.svg" 
            alt="Chat" 
            style={{ 
              width: `${(isMobile ? 16 : 24) * scale}px`,
              height: `${(isMobile ? 16 : 24) * scale}px`,
              filter: 'invert(1) brightness(2)' 
            }} 
          />
        </button>
        {showPlayerListTab && (
          <button
            className={`flex items-center justify-center rounded-lg font-semibold transition ${
              activeTab === 'players'
                ? 'bg-gradient-to-r from-cyan-500 to-teal-600 shadow-md shadow-cyan-950/30'
                : 'border border-white/10 bg-white/5 hover:bg-white/10'
            }`}
            style={{
              width: `${(isMobile ? 48 : 80) * scale}px`,
              height: `${(isMobile ? 32 : 40) * scale}px`,
            }}
            onClick={() => onTabChange('players')}
            aria-label="Players"
          >
            <img 
              src="/players.svg" 
              alt="Players" 
              style={{ 
                width: `${(isMobile ? 16 : 24) * scale}px`,
                height: `${(isMobile ? 16 : 24) * scale}px`,
                filter: 'invert(1) brightness(2)' 
              }} 
            />
          </button>
        )}
        
        {/* Toggle switch for chat type */}
        {onToggleChatType && (
          <div className="flex items-center gap-2 ml-2">
            <span 
              className="text-slate-300"
              style={{
                fontSize: `${(isMobile ? 12 : 14) * scale}px`
              }}
            >
              {chatType === 'game' ? 'Game' : 'Lobby'}
            </span>
            <button
              onClick={onToggleChatType}
              className="relative inline-flex items-center rounded-full border border-white/10 bg-slate-900/70 shadow-inner transition-colors"
              style={{
                height: `${(isMobile ? 20 : 24) * scale}px`,
                width: `${(isMobile ? 36 : 44) * scale}px`,
              }}
              aria-label={`Switch to ${chatType === 'game' ? 'lobby' : 'game'} chat`}
            >
              <span
                className="inline-block rounded-full bg-gradient-to-br from-cyan-400 to-teal-600 shadow-sm transition-transform"
                style={{
                  height: `${(isMobile ? 16 : 20) * scale}px`,
                  width: `${(isMobile ? 16 : 20) * scale}px`,
                  transform: chatType === 'game' 
                    ? `translateX(${(isMobile ? 16 : 20) * scale}px)` 
                    : 'translateX(0)'
                }}
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
