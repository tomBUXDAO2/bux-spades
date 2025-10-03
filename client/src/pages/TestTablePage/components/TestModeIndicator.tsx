import React from 'react';

interface TestModeIndicatorProps {
  isVisible: boolean;
}

export const TestModeIndicator: React.FC<TestModeIndicatorProps> = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <div className="fixed top-4 left-4 z-50 bg-yellow-500 text-black px-3 py-1 rounded-lg font-semibold shadow-lg">
      TEST MODE - Card Sizing
    </div>
  );
};
