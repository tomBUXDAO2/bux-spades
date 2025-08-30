import { useEffect, useState } from 'react';

interface EmojiReactionProps {
  emoji: string;
  onComplete: () => void;
}

export default function EmojiReaction({ emoji, onComplete }: EmojiReactionProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Start fade out after 2 seconds
    const fadeTimer = setTimeout(() => {
      setIsVisible(false);
    }, 2000);

    // Complete after fade animation (500ms)
    const completeTimer = setTimeout(() => {
      onComplete();
    }, 2500);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div 
      className={`absolute inset-0 flex items-center justify-center z-50 transition-opacity duration-500 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="text-7xl animate-bounce">
        {emoji}
      </div>
    </div>
  );
} 