// Chat input component with emoji picker
// Extracted from Chat.tsx

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';

interface EmojiData {
  native: string;
}

interface ChatInputProps {
  newMessage: string;
  setNewMessage: (message: string) => void;
  onSendMessage: (message: string) => void;
  isEmojiPickerOpen: boolean;
  setIsEmojiPickerOpen: (open: boolean) => void;
  isMobile: boolean;
  scaleFactor: number;
  chatType: 'game' | 'lobby';
  isConnected: boolean;
  isAuthenticated: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  newMessage,
  setNewMessage,
  onSendMessage,
  isEmojiPickerOpen,
  setIsEmojiPickerOpen,
  isMobile,
  scaleFactor,
  chatType,
  isConnected,
  isAuthenticated
}) => {
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  // Scale down for different screen widths
  const screenWidth = window.innerWidth;
  const isSmallScreen = screenWidth >= 600 && screenWidth <= 649;
  const isMediumScreen = screenWidth >= 700 && screenWidth <= 750;
  const scale = isSmallScreen ? 0.8 : isMediumScreen ? 0.85 : 1;

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setIsEmojiPickerOpen(false);
      }
    };

    if (isEmojiPickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEmojiPickerOpen, setIsEmojiPickerOpen]);

  const handleEmojiSelect = (emoji: EmojiData) => {
    (setNewMessage as any)((prev: string) => prev + emoji.native);
    setIsEmojiPickerOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() && isConnected && isAuthenticated) {
      onSendMessage(newMessage.trim());
      setNewMessage('');
      setRetryCount(0);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const getInputStyles = () => {
    const baseSize = isMobile ? 12 : 14;
    return {
      fontSize: `${Math.floor(baseSize * scaleFactor * scale)}px`,
      padding: `${(isMobile ? 8 : 12) * scale}px`,
      height: `${(isMobile ? 36 : 44) * scale}px`
    };
  };

  return (
    <div 
      className="border-t border-white/10"
      style={{
        padding: `${8 * scale}px`
      }}
    >
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={`Type a ${chatType} message...`}
            className="w-full rounded-lg border border-white/10 bg-slate-900/60 pr-10 text-slate-100 placeholder:text-slate-500 backdrop-blur-sm focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            style={getInputStyles()}
            disabled={!isConnected || !isAuthenticated}
          />
          
          {/* Emoji picker button */}
          <button
            ref={emojiButtonRef}
            type="button"
            onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
            className="absolute top-1/2 -translate-y-1/2 transform text-slate-500 transition-colors hover:text-cyan-300"
            style={{
              right: `${8 * scale}px`
            }}
            disabled={!isConnected || !isAuthenticated}
          >
            😀
          </button>
          
          {/* Emoji picker - rendered via portal */}
          {isEmojiPickerOpen && emojiButtonRef.current && createPortal(
            <div
              ref={emojiPickerRef}
              className="fixed z-[99999]"
              style={{
                top: emojiButtonRef.current.getBoundingClientRect().top - 10,
                left: emojiButtonRef.current.getBoundingClientRect().right - 300,
                transform: 'translateY(-100%)'
              }}
            >
              <Picker
                data={data}
                onEmojiSelect={handleEmojiSelect}
                theme="dark"
                previewPosition="none"
                searchPosition="top"
                skinTonePosition="search"
                perLine={8}
                emojiSize={isMobile ? 20 : 24}
                maxFrequentRows={2}
              />
            </div>,
            document.body
          )}
        </div>
        
        <button
          type="submit"
          disabled={!newMessage.trim() || !isConnected || !isAuthenticated}
          className={`flex flex-shrink-0 items-center justify-center rounded-lg border transition ${
            newMessage.trim() && isConnected && isAuthenticated
              ? 'border-cyan-500/30 bg-gradient-to-r from-cyan-500 to-teal-600 text-white shadow-md shadow-cyan-950/25 hover:from-cyan-400 hover:to-teal-500'
              : 'border-white/10 bg-slate-800/80 text-slate-500'
          }`}
          style={{
            width: `${40 * scale}px`,
            height: `${40 * scale}px`,
          }}
          aria-label="Send"
        >
          {/* Right-pointing paper plane icon - same as lobby chat */}
          <svg 
            style={{
              width: `${24 * scale}px`,
              height: `${24 * scale}px`,
              color: 'white'
            }}
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l16 8-16 8 4-8z" />
          </svg>
        </button>
      </form>
      
      {/* Connection status */}
      {!isConnected && (
        <div className="mt-1 text-xs text-red-400/90">
          Disconnected. Retrying... ({retryCount}/3)
        </div>
      )}
      
      {!isAuthenticated && (
        <div className="mt-1 text-xs text-amber-400/90">
          Not authenticated. Please refresh the page.
        </div>
      )}
    </div>
  );
};
