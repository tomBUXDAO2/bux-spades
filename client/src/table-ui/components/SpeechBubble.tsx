import { useEffect, useState } from 'react';

interface SpeechBubbleProps {
  message: string;
  isVisible: boolean;
  onFadeOut: () => void;
  maxLength?: number;
  position?: 'left' | 'bottom'; // Add position prop
  playerPosition?: number; // Add player position for specific cases
}

export default function SpeechBubble({ 
  message, 
  isVisible, 
  onFadeOut, 
  maxLength = 50,
  position = 'bottom', // Default to bottom
  playerPosition // Add playerPosition prop
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
        maxWidth: '250px',
        minWidth: '120px'
      }}
    >
      {/* Speech bubble - HIDDEN FOR TESTING */}
      <div className="bg-white text-gray-800 rounded-lg px-4 py-3 relative" style={{ display: 'none' }}>
        {/* Message */}
        <div className={`text-base font-bold leading-tight ${
          playerPosition === 3 ? 'text-right' : 'text-left'
        }`}>
          {displayMessage}
        </div>
      </div>
      
      {/* Speech bubble tail - VISIBLE FOR TESTING */}
      {playerPosition === 1 ? (
        // West player (position 1) - arrow pointing up from bottom of container
        <div 
          className="absolute w-0 h-0 border-transparent"
          style={{
            bottom: '-8px',
            left: '50%',
            transform: 'translateX(-50%)',
            borderLeftWidth: '16px',
            borderRightWidth: '16px',
            borderTopWidth: '0px',
            borderBottomWidth: '16px',
            borderBottomColor: 'white'
          }}
        ></div>
      ) : playerPosition === 3 ? (
        // East player (position 3) - arrow pointing up from bottom of container
        <div 
          className="absolute w-0 h-0 border-transparent"
          style={{
            bottom: '-8px',
            left: '50%',
            transform: 'translateX(-50%)',
            borderLeftWidth: '16px',
            borderRightWidth: '16px',
            borderTopWidth: '0px',
            borderBottomWidth: '16px',
            borderBottomColor: 'white'
          }}
        ></div>
      ) : position === 'left' ? (
        // North/South players (position 0/2) - arrow pointing right from right edge of container
        <div 
          className="absolute w-0 h-0 border-transparent"
          style={{
            top: '50%',
            transform: 'translateY(-50%)',
            right: '-8px',
            borderLeftWidth: '16px',
            borderRightWidth: '0px',
            borderTopWidth: '16px',
            borderBottomWidth: '16px',
            borderLeftColor: 'white'
          }}
        ></div>
      ) : (
        // Fallback for bottom-positioned bubbles (shouldn't be used with new logic)
        <div 
          className="absolute left-1/2 -translate-x-1/2 w-0 h-0 border-transparent"
          style={{
            top: '-8px',
            borderLeftWidth: '16px',
            borderRightWidth: '16px',
            borderTopWidth: '0px',
            borderBottomWidth: '16px',
            borderBottomColor: 'white'
          }}
        ></div>
      )}
    </div>
  );
} 