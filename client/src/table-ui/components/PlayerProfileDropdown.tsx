import React, { useState, useRef, useEffect } from 'react';
import { FaEllipsisV } from 'react-icons/fa';

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
        onClick={() => setIsOpen(!isOpen)}
      >
        {children}
        
        {/* Dropdown indicator */}
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-gray-800 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <FaEllipsisV className="w-2 h-2 text-white" />
        </div>
      </div>

      {/* Main Dropdown Menu */}
      {isOpen && !showEmojiPicker && (
        <div className="absolute z-50 mt-2 w-32 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
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
        <div className="absolute z-50 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
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