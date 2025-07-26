import React, { useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';

interface HeaderProps {
  onOpenMyStats?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onOpenMyStats }) => {
  const { user, logout, updateProfile } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64String = event.target?.result as string;
        console.log('[AVATAR DEBUG] File converted to base64, length:', base64String.length);
        
        // Update profile with new avatar
        console.log('[AVATAR DEBUG] Calling updateProfile with username:', user?.username);
        await updateProfile(user?.username || '', base64String);
        console.log('[AVATAR DEBUG] Profile update completed');
        
        // Close dropdown
        setIsDropdownOpen(false);
      };
      reader.onerror = (error) => {
        console.error('[AVATAR DEBUG] FileReader error:', error);
        alert('Failed to read file. Please try again.');
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('[AVATAR DEBUG] Error uploading avatar:', error);
      alert('Failed to upload avatar. Please try again.');
      setIsUploading(false);
    }
  };

  return (
    <header className="bg-slate-800 border-b border-slate-700">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <img 
              src="/bux-logo.png" 
              alt="BUX"
              className="h-8 w-auto" 
            />
            <span className="text-2xl font-bold text-slate-200">Spades</span>
          </div>
          
          <div className="flex items-center space-x-6">
            {/* Coin Balance */}
            <div className="flex items-center space-x-2">
              <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-slate-200 font-medium">{user?.coins?.toLocaleString()}</span>
            </div>

            {/* User Profile */}
            <div className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center space-x-3 focus:outline-none"
              >
                <div className="flex items-center space-x-3">
                  <img
                    src={user?.avatar || '/default-avatar.png'}
                    alt="Profile"
                    className="w-8 h-8 rounded-full bg-slate-700"
                  />
                  <span className="text-slate-200 font-medium hidden sm:inline">{user?.username}</span>
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
                <div className="absolute right-0 mt-2 w-48 bg-slate-800 rounded-md shadow-lg py-1 border border-slate-700 z-50">
                  <button
                    onClick={() => {
                      setIsDropdownOpen(false);
                      handleChangeAvatarClick();
                    }}
                    disabled={isUploading}
                    className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUploading ? 'Uploading...' : 'Change Avatar'}
                  </button>
                  <button
                    onClick={() => {
                      setIsDropdownOpen(false);
                      if (onOpenMyStats) onOpenMyStats();
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"
                  >
                    My Stats
                  </button>
                  <div className="border-t border-slate-700"></div>
                  <button
                    onClick={() => {
                      setIsDropdownOpen(false);
                      logout();
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
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
    </header>
  );
};

export default Header; 