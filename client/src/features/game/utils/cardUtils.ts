// Card utility functions for GameTable component
// These functions handle card dimensions, positioning, and visibility calculations

export interface CardDimensions {
  cardUIWidth: number;
  cardUIHeight: number;
}

export interface CardVisibility {
  showAllCards: boolean;
  visibleCount: number;
}

/**
 * Calculate card dimensions based on screen size and scale factor
 */
export const getCardDimensions = (
  isMobile: boolean,
  scaleFactor: number
): CardDimensions => {
  const cardUIWidth = Math.floor(
    isMobile 
      ? 55 
      : (window.innerWidth >= 900 && window.innerWidth <= 1300 ? 100 : 120) * scaleFactor
  );
  const cardUIHeight = Math.floor(
    isMobile 
      ? 77 
      : (window.innerWidth >= 900 && window.innerWidth <= 1300 ? 140 : 168) * scaleFactor
  );
  
  return { cardUIWidth, cardUIHeight };
};

/**
 * Calculate card overlap offset based on screen width and scale factor
 */
export const getCardOverlapOffset = (scaleFactor: number): number => {
  const width = window.innerWidth;
  
  if (width < 600) {
    return Math.floor(-40 * scaleFactor);
  } else if (width >= 600 && width < 650) {
    return Math.floor(-27 * scaleFactor);
  } else if (width >= 650 && width < 700) {
    return Math.floor(-40 * scaleFactor);
  } else if (width >= 700 && width < 750) {
    return Math.floor(-35 * scaleFactor);
  } else if (width >= 750 && width < 800) {
    return Math.floor(-30 * scaleFactor);
  } else if (width >= 800 && width < 850) {
    return Math.floor(-25 * scaleFactor);
  } else if (width >= 850 && width < 900) {
    return Math.floor(-20 * scaleFactor);
  } else if (width >= 900 && width <= 1200) {
    return Math.floor(-40 * scaleFactor);
  } else if (width >= 1201 && width <= 1300) {
    return Math.floor(-35 * scaleFactor);
  } else if (width >= 1400 && width <= 1499) {
    return Math.floor(-50 * scaleFactor);
  } else if (width >= 1500 && width <= 1599) {
    return Math.floor(-45 * scaleFactor);
  } else if (width >= 1600 && width <= 1699) {
    return Math.floor(-40 * scaleFactor);
  } else if (width >= 1700 && width <= 1799) {
    return Math.floor(-35 * scaleFactor);
  } else if (width >= 1800 && width <= 1899) {
    return Math.floor(-30 * scaleFactor);
  } else if (width >= 1900 && width <= 1999) {
    return Math.floor(-25 * scaleFactor);
  } else {
    return Math.floor(-20 * scaleFactor);
  }
};

/**
 * Determine card visibility based on game state and dealing status
 */
export const getCardVisibility = (
  sortedHand: any[],
  gameStatus: string,
  dealingComplete: boolean,
  dealtCardCount: number
): CardVisibility => {
  const showAllCards = gameStatus === 'PLAYING' || gameStatus === 'BIDDING' || dealingComplete;
  const visibleCount = showAllCards 
    ? (sortedHand && Array.isArray(sortedHand) ? sortedHand.length : 0) 
    : dealtCardCount;
  
  return { showAllCards, visibleCount };
};

/**
 * Calculate spectator hand dimensions
 */
export const getSpectatorHandDimensions = (
  isMobile: boolean,
  scaleFactor: number
): CardDimensions & { overlapOffset: number } => {
  const cardUIWidth = Math.floor(isMobile ? 65 : 100 * scaleFactor);
  const cardUIHeight = Math.floor(isMobile ? 90 : 140 * scaleFactor);
  const overlapOffset = Math.floor(isMobile ? -40 : -40 * scaleFactor);
  
  return { cardUIWidth, cardUIHeight, overlapOffset };
};
