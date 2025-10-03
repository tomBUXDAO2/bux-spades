import React from 'react';

interface PositionClassesProps {
  position: number;
  isVerySmallScreen: boolean;
  isMobile: boolean;
}

export const getPositionClasses = ({ position, isVerySmallScreen, isMobile }: PositionClassesProps): string => {
  const baseClasses = "absolute";
  
  if (isVerySmallScreen) {
    switch (position) {
      case 0: return `${baseClasses} top-1 left-1/2 transform -translate-x-1/2`;
      case 1: return `${baseClasses} right-1 top-1/2 transform -translate-y-1/2`;
      case 2: return `${baseClasses} bottom-1 left-1/2 transform -translate-x-1/2`;
      case 3: return `${baseClasses} left-1 top-1/2 transform -translate-y-1/2`;
      default: return baseClasses;
    }
  } else if (isMobile) {
    switch (position) {
      case 0: return `${baseClasses} top-2 left-1/2 transform -translate-x-1/2`;
      case 1: return `${baseClasses} right-2 top-1/2 transform -translate-y-1/2`;
      case 2: return `${baseClasses} bottom-2 left-1/2 transform -translate-x-1/2`;
      case 3: return `${baseClasses} left-2 top-1/2 transform -translate-y-1/2`;
      default: return baseClasses;
    }
  } else {
    switch (position) {
      case 0: return `${baseClasses} top-4 left-1/2 transform -translate-x-1/2`;
      case 1: return `${baseClasses} right-4 top-1/2 transform -translate-y-1/2`;
      case 2: return `${baseClasses} bottom-4 left-1/2 transform -translate-x-1/2`;
      case 3: return `${baseClasses} left-4 top-1/2 transform -translate-y-1/2`;
      default: return baseClasses;
    }
  }
};

export const getAvatarDimensions = (isVerySmallScreen: boolean, isMobile: boolean) => {
  if (isVerySmallScreen) {
    return { width: 24, height: 24 };
  } else if (isMobile) {
    return { width: 32, height: 32 };
  } else {
    return { width: 40, height: 40 };
  }
};
