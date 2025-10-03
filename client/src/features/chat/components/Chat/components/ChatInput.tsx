// Chat input component with emoji picker
// Extracted from Chat.tsx

import React, { useState, useRef, useEffect } from 'react';
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
  const [retryCount, setRetryCount] = useState(0);

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
      fontSize: `${Math.floor(baseSize * scaleFactor)}px`,
      padding: isMobile ? '8px' : '12px',
      height: isMobile ? '36px' : '44px'
    };
  };

  return (
    <div className="border-t border-gray-600 p-2">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={`Type a ${chatType} message...`}
            className="w-full bg-gray-700 text-white rounded-lg border-0 pr-10 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            style={getInputStyles()}
            disabled={!isConnected || !isAuthenticated}
          />
          
          {/* Emoji picker button */}
          <button
            type="button"
            onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
            disabled={!isConnected || !isAuthenticated}
          >
            😀
          </button>
          
          {/* Emoji picker */}
          {isEmojiPickerOpen && (
            <div
              ref={emojiPickerRef}
              className="absolute bottom-full right-0 mb-2 z-50"
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
            </div>
          )}
        </div>
        
        <button
          type="submit"
          disabled={!newMessage.trim() || !isConnected || !isAuthenticated}
          className={`w-10 h-10 flex items-center justify-center rounded-md transition flex-shrink-0 ${
            newMessage.trim() && isConnected && isAuthenticated
              ? 'bg-indigo-600 hover:bg-indigo-700'
              : 'bg-gray-600 cursor-not-allowed'
          }`}
          aria-label="Send"
        >
          {/* Right-pointing paper plane icon - same as lobby chat */}
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l16 8-16 8 4-8z" />
          </svg>
        </button>
      </form>
      
      {/* Connection status */}
      {!isConnected && (
        <div className="text-xs text-red-400 mt-1">
          Disconnected. Retrying... ({retryCount}/3)
        </div>
      )}
      
      {!isAuthenticated && (
        <div className="text-xs text-yellow-400 mt-1">
          Not authenticated. Please refresh the page.
        </div>
      )}
    </div>
  );
};
