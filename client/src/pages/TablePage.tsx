import React from 'react';
import { useNavigate } from 'react-router-dom';
import GameTableWrapper from '@/features/game/components/GameTableWrapper';
import LandscapePrompt from '../LandscapePrompt';

const TABLE_RETURN_KEY = 'tableReturnPath';

export function setTableReturnPath(path: string) {
  try {
    sessionStorage.setItem(TABLE_RETURN_KEY, path);
  } catch {
    /* ignore */
  }
}

export function consumeTableReturnPath(): string | null {
  try {
    const path = sessionStorage.getItem(TABLE_RETURN_KEY);
    sessionStorage.removeItem(TABLE_RETURN_KEY);
    return path;
  } catch {
    return null;
  }
}

export default function TablePage() {
  const navigate = useNavigate();

  const handleLeaveTable = () => {
    const returnPath = consumeTableReturnPath();
    if (returnPath && returnPath.startsWith('/') && !returnPath.startsWith('//')) {
      navigate(returnPath);
      return;
    }
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