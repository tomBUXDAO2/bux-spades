import React from 'react';
import { useWindowSize } from '@/hooks/useWindowSize';

interface TestModeIndicatorProps {
  isVisible: boolean;
}

export const TestModeIndicator: React.FC<TestModeIndicatorProps> = ({ isVisible }) => {
  const { width, height, isMobile, isLandscape } = useWindowSize();

  if (!isVisible) return null;

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;

  return (
    <div className="fixed top-4 left-4 z-50 max-w-[min(100vw-2rem,20rem)] rounded-lg bg-yellow-500 px-3 py-2 font-semibold text-black shadow-lg">
      <div className="text-sm leading-tight">UI test table (/test-table)</div>
      <div className="mt-1 text-xs font-normal leading-snug opacity-90">
        {width}×{height}px · {dpr.toFixed(2)}dpr
        {isMobile ? ' · mobile' : ' · desktop'}
        {isLandscape ? ' · landscape' : ' · portrait'}
      </div>
    </div>
  );
};
