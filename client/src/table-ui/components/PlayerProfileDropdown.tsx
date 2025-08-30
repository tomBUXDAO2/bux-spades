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

      {/* Main Dropdown Menu - rendered outside overflow container */}
      {isOpen && !showEmojiPicker && (
        <div 
          className="fixed z-[9999] w-32 bg-gray-800 rounded-lg shadow-lg border border-white py-1" 
          style={{ 
            bottom: 'auto',
            left: 'auto',
            transform: 'none',
            top: dropdownRef.current ? dropdownRef.current.getBoundingClientRect().top - 40 : 0,
            left: dropdownRef.current ? dropdownRef.current.getBoundingClientRect().left + (dropdownRef.current.offsetWidth / 2) - 64 : 0
          }}
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
                className="w-full px-3 py-2 text-left text-sm text-white hover:bg-gray-700 flex items-center border-b border-gray-600"
              >
                <span className="mr-2">😀</span>
                Emoji
              </button>
              <button
                onClick={() => {
                  onViewStats();
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-white hover:bg-gray-700 flex items-center"
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
              className="w-full px-3 py-2 text-left text-sm text-white hover:bg-gray-700 flex items-center"
            >
              <span className="mr-2">📊</span>
              View Stats
            </button>
          )}
        </div>
      )}

      {/* Emoji Picker - rendered outside overflow container */}
      {showEmojiPicker && (
        <div 
          className="fixed z-[9999] w-64 bg-gray-800 rounded-lg shadow-lg border border-white p-2" 
          style={{ 
            bottom: 'auto',
            left: 'auto',
            transform: 'none',
            top: dropdownRef.current ? dropdownRef.current.getBoundingClientRect().top - 120 : 0,
            left: dropdownRef.current ? dropdownRef.current.getBoundingClientRect().left + (dropdownRef.current.offsetWidth / 2) - 128 : 0
          }}
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
        >
          <div className="text-xs text-gray-300 mb-2 px-2">Quick React</div>
          <div className="grid grid-cols-5 gap-1">
            {EMOJI_OPTIONS.map((emoji, index) => (
              <button
                key={index}
                onClick={() => handleEmojiClick(emoji)}
                className="w-8 h-8 text-lg hover:bg-gray-700 rounded flex items-center justify-center transition-colors"
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