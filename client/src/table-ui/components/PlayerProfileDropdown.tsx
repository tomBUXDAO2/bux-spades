import React, { useState, useRef, useEffect } from 'react';

interface PlayerProfileDropdownProps {
  player: {
    id: string;
    username?: string;
    avatar?: string;
    coins?: number;
  };
  isCurrentUser: boolean;
  onViewStats: () => void;
  onShowEmojiPicker: () => void;
  onEmojiReaction: (emoji: string) => void;
  children: React.ReactNode;
}

const EMOJI_OPTIONS = [
  '❤️', '🤣', '😎', '🥳', '🤪', '🤦', '🥰', '😭', '😬', '🍀', '👍', '🤬', '🤮', '💩', '🖕'
];

export default function PlayerProfileDropdown({
  isCurrentUser,
  onViewStats,
  onShowEmojiPicker,
  onEmojiReaction,
  children
}: PlayerProfileDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleEmojiClick = (emoji: string) => {
    onEmojiReaction(emoji);
    setShowEmojiPicker(false);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Profile Picture with Dropdown Trigger */}
      <div 
        className="cursor-pointer relative group"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => {
          setTimeout(() => {
            if (!showEmojiPicker) {
              setIsOpen(false);
            }
          }, 100);
        }}
      >
        {children}
      </div>

      {/* Main Dropdown Menu */}
      {isOpen && !showEmojiPicker && (
        <div 
          className="absolute z-[9999] mb-2 w-32 bg-white rounded-lg shadow-lg border border-gray-200 py-1" 
          style={{ bottom: '100%', left: '50%', transform: 'translateX(-50%)' }}
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
        >
          {isCurrentUser ? (
            <>
              <button
                onClick={() => {
                  setShowEmojiPicker(true);
                  onShowEmojiPicker();
                }}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center"
              >
                <span className="mr-2">😀</span>
                Emoji
              </button>
              <button
                onClick={() => {
                  onViewStats();
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center"
              >
                <span className="mr-2">📊</span>
                My Stats
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                onViewStats();
                setIsOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center"
            >
              <span className="mr-2">📊</span>
              View Stats
            </button>
          )}
        </div>
      )}

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <div 
          className="absolute z-[9999] mb-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 p-2" 
          style={{ bottom: '100%', left: '50%', transform: 'translateX(-50%)' }}
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
        >
          <div className="text-xs text-gray-500 mb-2 px-2">Quick React</div>
          <div className="grid grid-cols-5 gap-1">
            {EMOJI_OPTIONS.map((emoji, index) => (
              <button
                key={index}
                onClick={() => handleEmojiClick(emoji)}
                className="w-8 h-8 text-lg hover:bg-gray-100 rounded flex items-center justify-center transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 