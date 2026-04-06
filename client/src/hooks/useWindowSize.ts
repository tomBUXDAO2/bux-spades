import { useState, useEffect } from 'react';
import { isCompactGameLayout } from './windowLayout';

interface WindowSize {
  width: number;
  height: number;
  isMobile: boolean;
  isLandscape: boolean;
}

export const useWindowSize = (): WindowSize => {
  const [windowSize, setWindowSize] = useState<WindowSize>({
    width: window.innerWidth,
    height: window.innerHeight,
    isMobile: isCompactGameLayout(window.innerWidth, window.innerHeight),
    isLandscape: window.innerWidth > window.innerHeight
  });

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setWindowSize({
        width: w,
        height: h,
        isMobile: isCompactGameLayout(w, h),
        isLandscape: w > h
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return windowSize;
}; 