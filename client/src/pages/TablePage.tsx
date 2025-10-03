import React from 'react';
import { useNavigate } from 'react-router-dom';
import GameTableWrapper from '@/features/game/components/GameTableWrapper';
import LandscapePrompt from '../LandscapePrompt';

export default function TablePage() {
  const navigate = useNavigate();

  const handleLeaveTable = () => {
    navigate('/');
  };

  // Check if device is mobile or tablet
  const isMobileOrTablet = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           window.innerWidth <= 1024;
  };

  return (
    <div className="relative">
      {/* Show landscape prompt on mobile devices */}
      {isMobileOrTablet() && (
        <LandscapePrompt />
      )}
      
      {/* Game Table with real-time socket integration */}
      <GameTableWrapper onLeaveTable={handleLeaveTable} />
    </div>
  );
}