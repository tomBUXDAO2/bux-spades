// Scale utility functions for GameTable component
// These functions handle responsive scaling calculations

export interface WindowSize {
  width: number;
  height: number;
  isMobile: boolean;
}

/**
 * Check if screen is mobile
 */
export const isMobileScreen = (windowSize: WindowSize): boolean => {
  return windowSize.width < 640;
};

/**
 * Calculate base scale factor
 */
export const calculateBaseScale = (windowSize: WindowSize): number => {
  const referenceWidth = 1200; // Reference width for desktop
  return Math.min(1, windowSize.width / referenceWidth);
};

/**
 * Apply minimum scale constraint
 */
export const applyMinimumScale = (scale: number): number => {
  return Math.max(0.6, scale);
};

/**
 * Get scale factor for responsive design
 */
export const getScaleFactor = (windowSize: WindowSize): number => {
  // Don't scale on mobile
  if (isMobileScreen(windowSize)) return 1;
  
  const baseScale = calculateBaseScale(windowSize);
  return applyMinimumScale(baseScale);
};
