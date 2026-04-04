import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { useLoginModal } from '@/features/auth/LoginModalContext';
import GameRulesModal from '@/components/modals/GameRulesModal';
import AdminPanel from '@/components/admin/AdminPanel';
import { isAdmin } from '@/utils/adminUtils';

interface HeaderProps {
  onOpenMyStats?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onOpenMyStats }) => {
  const { user, logout, updateProfile } = useAuth();
  const { openLoginModal } = useLoginModal();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGameRulesOpen, setIsGameRulesOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Detect screen width for responsive sizing
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  
  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Apply scaling for 600-649px screens (landscape)
  const isSmallScreen = screenWidth >= 600 && screenWidth <= 649;
  // Apply medium scaling for 650-699px screens
  const isMediumScreen = screenWidth >= 650 && screenWidth <= 699;
  // Apply large scaling for 700-749px screens
  const isLargeScreen = screenWidth >= 700 && screenWidth <= 749;
  // Apply extra large scaling for 750-799px screens
  const isExtraLargeScreen = screenWidth >= 750 && screenWidth <= 799;
  const textScale = isSmallScreen ? 0.85 : (isMediumScreen ? 0.9 : (isLargeScreen ? 0.95 : (isExtraLargeScreen ? 0.98 : 1)));
  
  // Check if user is admin
  const userIsAdmin = isAdmin(user?.discordId);

  const handleChangeAvatarClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    console.log('[AVATAR DEBUG] File selected:', file);
    
    if (!file) {
      console.log('[AVATAR DEBUG] No file selected');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      console.log('[AVATAR DEBUG] Invalid file type:', file.type);
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      console.log('[AVATAR DEBUG] File too large:', file.size);
      alert('File size must be less than 5MB');
      return;
    }

    console.log('[AVATAR DEBUG] Starting upload process');
    setIsUploading(true);
    try {
      // Compress and resize the image before converting to base64
      const compressedImage = await compressImage(file);
      console.log('[AVATAR DEBUG] Image compressed, new size:', compressedImage.length);
      
      // Update profile with new avatar
      console.log('[AVATAR DEBUG] Calling updateProfile with username:', user?.username);
      await updateProfile(user?.username || '', compressedImage);
      console.log('[AVATAR DEBUG] Profile update completed');
      
      // Close dropdown
      setIsDropdownOpen(false);
    } catch (error) {
      console.error('[AVATAR DEBUG] Error uploading avatar:', error);
      alert('Failed to upload avatar. Please try again.');
      setIsUploading(false);
    }
  };

  // Function to compress and resize image
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Set canvas size (max 200x200 for avatars)
        const maxSize = 200;
        let { width, height } = img;
        
        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw and compress
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Convert to base64 with compression (0.7 quality)
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        resolve(compressedBase64);
      };
      
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  return (
    <header className="border-b border-white/10 bg-slate-950/70 backdrop-blur-xl shadow-lobby-sm">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <img 
                              src="/optimized/bux-spades.png" 
              alt="BUX"
              className="h-8 w-auto" 
            />
          </div>
          
          <div className="flex items-center space-x-6">
            {!user ? (
              <button
                type="button"
                onClick={() => openLoginModal()}
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 px-4 py-2 font-semibold text-white shadow-md shadow-cyan-950/40 transition hover:from-cyan-400 hover:to-teal-500"
                style={{ fontSize: `${14 * textScale}px` }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Sign in
              </button>
            ) : (
              <>
            {/* Coin Balance */}
            <div className="flex items-center space-x-2">
              <svg className="h-5 w-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
              <span className="bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text font-semibold text-transparent" style={{ fontSize: `${14 * textScale}px` }}>{user.coins?.toLocaleString() || '0'}</span>
            </div>

            {/* User Profile */}
            <div className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="header-button flex items-center space-x-3 focus:outline-none"
              >
                <div className="flex items-center space-x-3">
                  <img
                    src={user.avatar || user.avatarUrl || '/default-avatar.png'}
                    alt="Profile"
                    className="w-8 h-8 rounded-full bg-slate-700"
                  />
                  <span className="text-slate-200 font-medium hidden sm:inline" style={{ fontSize: `${14 * textScale}px` }}>{user.username || 'Loading...'}</span>
                </div>
                <svg
                  className={`w-5 h-5 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute right-0 z-50 mt-2 w-48 rounded-xl border border-white/10 bg-slate-950/95 py-1 shadow-lobby backdrop-blur-xl">
                  <button
                    onClick={() => {
                      setIsDropdownOpen(false);
                      handleChangeAvatarClick();
                    }}
                    disabled={isUploading}
                    className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUploading ? 'Uploading...' : 'Change Avatar'}
                  </button>
                  <button
                    onClick={() => {
                      setIsDropdownOpen(false);
                      if (onOpenMyStats) onOpenMyStats();
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-white/10"
                  >
                    My Stats
                  </button>
                  <button
                    onClick={() => {
                      setIsDropdownOpen(false);
                      setIsGameRulesOpen(true);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-white/10"
                  >
                    Game Rules
                  </button>
                  <div className="border-t border-slate-700"></div>
                  
                  {/* Admin Panel - Only visible to admins */}
                  {userIsAdmin && (
                    <>
                      <button
                        onClick={() => {
                          setIsDropdownOpen(false);
                          setIsAdminPanelOpen(true);
                        }}
                        className="block w-full text-left px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-950/50"
                      >
                        ⚠️ ADMIN ONLY
                      </button>
                      <div className="border-t border-slate-700"></div>
                    </>
                  )}
                  
                  <Link
                    to="/privacy"
                    onClick={() => setIsDropdownOpen(false)}
                    className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-white/10"
                  >
                    Privacy Policy
                  </Link>
                  <Link
                    to="/terms"
                    onClick={() => setIsDropdownOpen(false)}
                    className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-white/10"
                  >
                    Terms of Service
                  </Link>
                  <div className="border-t border-slate-700"></div>
                  <button
                    onClick={() => {
                      setIsDropdownOpen(false);
                      logout();
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-950/50"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
              </>
            )}
          </div>
        </div>
      </div>
      {/* Hidden file input for avatar upload */}
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleAvatarFileChange}
      />
      
      {/* Game Rules Modal */}
      <GameRulesModal 
        isOpen={isGameRulesOpen} 
        onClose={() => setIsGameRulesOpen(false)} 
      />
      
      {/* Admin Panel */}
      <AdminPanel
        isOpen={isAdminPanelOpen}
        onClose={() => setIsAdminPanelOpen(false)}
      />
    </header>
  );
};

export default Header; 