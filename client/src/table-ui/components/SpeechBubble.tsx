import React, { useEffect, useState } from 'react';

interface SpeechBubbleProps {
  message: string;
  playerName: string;
  isVisible: boolean;
  onFadeOut: () => void;
  maxLength?: number;
}

export default function SpeechBubble({ 
  message, 
  playerName, 
  isVisible, 
  onFadeOut, 
  maxLength = 50 
}: SpeechBubbleProps) {
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    if (isVisible) {
      // Start fade out after 4 seconds
      const fadeTimer = setTimeout(() => {
        setIsFading(true);
        // Call onFadeOut after fade animation completes
        setTimeout(() => {
          onFadeOut();
        }, 500); // 500ms fade animation
      }, 4000);

      return () => clearTimeout(fadeTimer);
    }
  }, [isVisible, onFadeOut]);

  if (!isVisible) return null;

  // Truncate message if too long
  const displayMessage = message.length > maxLength 
    ? message.substring(0, maxLength) + '...' 
    : message;

  return (
    <div 
      className={`absolute z-50 transition-opacity duration-500 ${
        isFading ? 'opacity-0' : 'opacity-100'
      }`}
      style={{
        maxWidth: '200px',
        minWidth: '100px'
      }}
    >
      {/* Speech bubble */}
      <div className="bg-white text-gray-800 rounded-lg px-3 py-2 shadow-lg border border-gray-200 relative">
        {/* Player name */}
        <div className="text-xs font-semibold text-gray-600 mb-1 truncate">
          {playerName}
        </div>
        
        {/* Message */}
        <div className="text-sm leading-tight">
          {displayMessage}
        </div>
        
        {/* Speech bubble tail */}
        <div className="absolute -bottom-2 left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white"></div>
      </div>
    </div>
  );
} 