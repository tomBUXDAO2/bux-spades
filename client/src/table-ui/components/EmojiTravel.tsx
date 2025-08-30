import React, { useState, useEffect } from 'react';

interface EmojiTravelProps {
  emoji: string;
  fromPosition: { x: number; y: number };
  toPosition: { x: number; y: number };
  onComplete: () => void;
}

export default function EmojiTravel({ emoji, fromPosition, toPosition, onComplete }: EmojiTravelProps) {
  const [position, setPosition] = useState(fromPosition);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    const startTime = Date.now();
    const duration = 500; // 0.5 seconds

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Linear interpolation between start and end positions
      const x = fromPosition.x + (toPosition.x - fromPosition.x) * progress;
      const y = fromPosition.y + (toPosition.y - fromPosition.y) * progress;

      setPosition({ x, y });

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Animation complete, fade out after a delay
        setTimeout(() => {
          setOpacity(0);
          setTimeout(onComplete, 500); // Wait for fade out animation
        }, 2000); // Show for 2 seconds before fading
      }
    };

    requestAnimationFrame(animate);
  }, [fromPosition, toPosition, onComplete]);

  return (
    <div
      className="fixed z-[9999] pointer-events-none"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
        opacity,
        transition: 'opacity 0.5s ease-out'
      }}
    >
      <div className="text-4xl animate-bounce">
        {emoji}
      </div>
    </div>
  );
} 