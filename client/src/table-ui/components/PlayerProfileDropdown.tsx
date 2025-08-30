import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

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
  onSendEmoji?: (emoji: string) => void;
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
  onSendEmoji,
  children
}: PlayerProfileDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      console.log('Click outside detected, target:', event.target);
      
      // Check if the click target is part of the dropdown menu (rendered via portal)
      const target = event.target as Element;
      const isDropdownMenu = target.closest('.dropdown-menu');
      const isEmojiPicker = target.closest('.emoji-picker');
      
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) && !isDropdownMenu && !isEmojiPicker) {
        console.log('Closing dropdown due to click outside');
        setIsOpen(false);
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleEmojiClick = (emoji: string) => {
    console.log('Emoji selected:', emoji);
    if (isCurrentUser) {
      onEmojiReaction(emoji);
    } else if (onSendEmoji) {
      onSendEmoji(emoji);
    }
    setShowEmojiPicker(false);
    setIsOpen(false);
  };

  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Profile Picture with Dropdown Trigger */}
      <div 
        className="cursor-pointer relative group"
        onClick={() => {
          console.log('Profile picture clicked, current isOpen:', isOpen);
          if (!isOpen) {
            console.log('Opening dropdown...');
            setIsOpen(true);
            const rect = dropdownRef.current?.getBoundingClientRect();
            if (rect) {
              // Check if dropdown would be off-screen above
              const dropdownHeight = 80; // Approximate height of dropdown
              const spaceAbove = rect.top;
              const spaceBelow = window.innerHeight - rect.bottom;
              
              let top, left;
              if (spaceAbove < dropdownHeight && spaceBelow > dropdownHeight) {
                // Position below if not enough space above but enough below
                top = rect.bottom + 10;
                left = rect.left + (rect.width / 2) - 64;
                console.log('Positioning dropdown below profile picture');
              } else {
                // Default position above
                top = rect.top - 60;
                left = rect.left + (rect.width / 2) - 64;
                console.log('Positioning dropdown above profile picture');
              }
              
              setDropdownPosition({ top, left });
              console.log('Dropdown position set:', { top, left });
            }
          } else {
            console.log('Closing dropdown...');
            setIsOpen(false);
            setShowEmojiPicker(false);
          }
        }}
      >
        {children}
      </div>

      {/* Main Dropdown Menu - rendered via portal outside component tree */}
      {isOpen && !showEmojiPicker && (() => {
        console.log('Rendering main dropdown menu');
        return createPortal(
        <div 
          className="fixed z-[9999] w-32 bg-gray-800 rounded-lg shadow-lg border border-white py-1 dropdown-menu" 
          style={{ 
            top: dropdownPosition.top,
            left: dropdownPosition.left
          }}
          onClick={(e) => {
            console.log('Dropdown container clicked');
            e.stopPropagation();
          }}
        >
          {isCurrentUser ? (
            <>
              <button
                onClick={(e) => {
                  console.log('Emoji button clicked');
                  e.stopPropagation();
                  setShowEmojiPicker(true);
                  onShowEmojiPicker();
                }}
                className="w-full px-3 py-2 text-left text-sm text-white hover:bg-gray-700 flex items-center border-b border-gray-600"
              >
                <span className="mr-2">😀</span>
                Emoji
              </button>
              <button
                onClick={(e) => {
                  console.log('My Stats button clicked');
                  e.stopPropagation();
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
            <>
              <button
                onClick={(e) => {
                  console.log('Send Emoji button clicked');
                  e.stopPropagation();
                  setShowEmojiPicker(true);
                }}
                className="w-full px-3 py-2 text-left text-sm text-white hover:bg-gray-700 flex items-center border-b border-gray-600"
              >
                <span className="mr-2">😀</span>
                Send Emoji
              </button>
              <button
                onClick={(e) => {
                  console.log('View Stats button clicked');
                  e.stopPropagation();
                  onViewStats();
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-white hover:bg-gray-700 flex items-center"
              >
                <span className="mr-2">📊</span>
                View Stats
              </button>
            </>
          )}
        </div>,
        document.body
      );
      })()}

      {/* Emoji Picker - rendered via portal outside component tree */}
      {showEmojiPicker && createPortal(
        <div 
          className="fixed z-[9999] w-64 bg-gray-800 rounded-lg shadow-lg border border-white p-2 emoji-picker" 
          style={{ 
            top: dropdownPosition.top - 100,
            left: dropdownPosition.left - 32
          }}
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
        </div>,
        document.body
      )}
    </div>
  );
} 