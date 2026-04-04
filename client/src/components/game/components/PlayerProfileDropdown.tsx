import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { isAdmin } from '@/utils/adminUtils';

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
  onOpenAdminPanel?: () => void;
  children: React.ReactNode;
  playerPosition?: number; // Add player position for positioning adjustments
}

const EMOJI_OPTIONS = [
   '🤣', '😎', '🥳', '🤪', '🥰', '😭', '😬', '🤬', '🤮', '🤦', '❤️', '🍀', '👍', '👎', '🖕', '🐢', '💩', '🛍️', 
];

export default function PlayerProfileDropdown({
  isCurrentUser,
  onViewStats,
  onShowEmojiPicker,
  onEmojiReaction,
  onSendEmoji,
  onOpenAdminPanel,
  children,
  playerPosition
}: PlayerProfileDropdownProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Check if user is admin
  const userIsAdmin = isAdmin(user?.discordId);

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
              
              // Adjust positioning for left and right players to keep dropdowns within table
              if (playerPosition === 1) {
                // Left player (West) - move dropdown down and to the right
                top += 20; // Move down by 20px
                left += 20; // Move right by 20px
                console.log('Adjusting dropdown for left player (West)');
              } else if (playerPosition === 3) {
                // Right player (East) - move dropdown down and to the left
                top += 20; // Move down by 20px
                left -= 20; // Move left by 20px
                console.log('Adjusting dropdown for right player (East)');
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
          className="dropdown-menu fixed z-[9999] w-32 rounded-lg border border-white/10 bg-slate-950/95 py-1 shadow-lobby backdrop-blur-xl" 
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
                className="flex w-full items-center border-b border-white/10 px-3 py-2 text-left text-sm text-white hover:bg-white/10"
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
                className={`flex w-full items-center px-3 py-2 text-left text-sm text-white hover:bg-white/10 ${userIsAdmin && onOpenAdminPanel ? 'border-b border-white/10' : ''}`}
              >
                <span className="mr-2">📊</span>
                My Stats
              </button>
              
              {/* Admin Panel - Only visible to admins */}
              {userIsAdmin && onOpenAdminPanel && (
                <button
                  onClick={(e) => {
                    console.log('Admin Panel button clicked');
                    e.stopPropagation();
                    onOpenAdminPanel();
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center px-3 py-2 text-left text-sm font-semibold text-red-300 hover:bg-red-950/40"
                >
                  <span className="mr-2">⚠️</span>
                  ADMIN
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={(e) => {
                  console.log('Send Emoji button clicked');
                  e.stopPropagation();
                  setShowEmojiPicker(true);
                }}
                className="flex w-full items-center border-b border-white/10 px-3 py-2 text-left text-sm text-white hover:bg-white/10"
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
                className="flex w-full items-center px-3 py-2 text-left text-sm text-white hover:bg-white/10"
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
          className="emoji-picker fixed z-[9999] w-64 rounded-lg border border-white/10 bg-slate-950/95 p-2 shadow-lobby backdrop-blur-xl" 
          style={{ 
            top: Math.max(10, Math.min(dropdownPosition.top - 100, window.innerHeight - 200)),
            left: (() => {
              let emojiLeft = dropdownPosition.left - 32;
              
              // Adjust emoji picker positioning based on player position
              if (playerPosition === 1) {
                // Left player (West) - move emoji picker right
                emojiLeft += 40;
              } else if (playerPosition === 3) {
                // Right player (East) - move emoji picker left more
                emojiLeft -= 80; // Increased from 40 to 80
              } else if (playerPosition === 0 || playerPosition === 2) {
                // Top players (North/South) - move emoji picker down more
                emojiLeft = dropdownPosition.left - 32; // Keep horizontal centered
              }
              
              return Math.max(10, Math.min(emojiLeft, window.innerWidth - 264));
            })()
          }}
        >
          <div className="mb-2 px-2 text-xs text-slate-400">Quick React</div>
          <div className="grid grid-cols-6 gap-1">
            {EMOJI_OPTIONS.map((emoji, index) => (
              <button
                key={index}
                onClick={() => handleEmojiClick(emoji)}
                className="flex h-8 w-8 items-center justify-center rounded text-lg transition-colors hover:bg-white/10"
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