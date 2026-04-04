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
 * Calculate card overlap offset to fill available width for 13 cards
 * This ensures cards are properly distributed across the player hand area
 */
export const getCardOverlapOffset = (scaleFactor: number, isMobile: boolean = false): number => {
  const width = window.innerWidth;
  
  // Calculate available width for player hand area
  // Use consistent percentage across all screen sizes for uniform card spacing
  const availableWidth = width * 0.7;
  
  // Get card dimensions - use the ACTUAL dimensions being used in the renderer
  const cardDimensions = getCardDimensions(isMobile, scaleFactor);
  const cardWidth = cardDimensions.cardUIWidth;
  
  // For 13 cards to fill available width:
  // Formula: availableWidth = cardWidth + (12 * visibleCardWidth)
  // Where visibleCardWidth is how much of each subsequent card is visible
  // Solve for visibleCardWidth: visibleCardWidth = (availableWidth - cardWidth) / 12
  const numCards = 13;
  const totalGaps = numCards - 1; // 12 gaps for 13 cards
  const visibleCardWidth = (availableWidth - cardWidth) / totalGaps;
  
  // The overlap is the difference between card width and visible width
  const calculatedOverlap = visibleCardWidth - cardWidth;
  
  // Debug logging
  console.log(`[CARD SPACING DEBUG] Screen width: ${width}, Available width: ${availableWidth}, Card width: ${cardWidth}, Visible card width: ${visibleCardWidth}, Calculated overlap: ${calculatedOverlap}`);
  
  // Use the calculated overlap directly
  const finalOverlap = Math.floor(calculatedOverlap);
  
  console.log(`[CARD SPACING DEBUG] Final overlap: ${finalOverlap}`);
  
  return finalOverlap;
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
 * Calculate spectator hand dimensions - MUST MATCH FACE-UP CARD DIMENSIONS
 */
export const getSpectatorHandDimensions = (
  isMobile: boolean,
  scaleFactor: number
): CardDimensions & { overlapOffset: number } => {
  // Use the SAME dimensions as face-up cards
  const cardDimensions = getCardDimensions(isMobile, scaleFactor);
  const overlapOffset = getCardOverlapOffset(scaleFactor, isMobile);
  
  return { 
    cardUIWidth: cardDimensions.cardUIWidth, 
    cardUIHeight: cardDimensions.cardUIHeight, 
    overlapOffset 
  };
};

/** Normalize suit for comparisons and trick keys (Unicode vs SPADES vs S). */
export const normalizeTrickSuitCode = (card: { suit?: string }): string => {
  const raw = String(card?.suit ?? '');
  const u = raw.toUpperCase();
  if (u.includes('SPADE') || raw === '♠') return 'S';
  if (u.includes('HEART') || raw === '♥') return 'H';
  if (u.includes('DIAMOND') || raw === '♦') return 'D';
  if (u.includes('CLUB') || raw === '♣') return 'C';
  if (u.length <= 2) return u.slice(0, 1).toUpperCase();
  return u;
};

/** Canonical rank for comparisons / keys (server vs client may differ). */
export const normalizeRankForTrick = (rank: string | number | undefined): string => {
  const s = String(rank ?? '').trim().toUpperCase();
  if (s === '10' || s === 'T' || s === 'TEN') return '10';
  if (s === 'ACE') return 'A';
  if (s === 'KING') return 'K';
  if (s === 'QUEEN') return 'Q';
  if (s === 'JACK') return 'J';
  return s;
};

export const cardsMatchForTrick = (
  a: { suit?: string; rank?: string | number },
  b: { suit?: string; rank?: string | number }
): boolean =>
  normalizeRankForTrick(a?.rank) === normalizeRankForTrick(b?.rank) &&
  normalizeTrickSuitCode(a) === normalizeTrickSuitCode(b);

/**
 * Stable React key for a card on the trick pile. Must NOT include seatIndex —
 * optimistic pending vs server payloads can disagree on seat and remount motion.
 * Rank + normalized suit is unique among cards in play for one deal.
 */
export const getTrickCardReactKey = (card: { suit?: string; rank?: string | number }): string => {
  return `trick-${normalizeTrickSuitCode(card)}-${normalizeRankForTrick(card?.rank)}`;
};

/** Trick cards from a card_played (or similar) socket payload. */
export const getTrickArrayFromSocketPayload = (cardData: {
  gameState?: { play?: { currentTrick?: unknown }; currentTrickCards?: unknown };
  currentTrick?: unknown;
}): any[] => {
  const g = cardData?.gameState;
  const fromGame =
    (Array.isArray(g?.play?.currentTrick) && g.play.currentTrick) ||
    (Array.isArray(g?.currentTrickCards) && g.currentTrickCards) ||
    [];
  if (fromGame.length) return fromGame as any[];
  return Array.isArray(cardData?.currentTrick) ? (cardData.currentTrick as any[]) : [];
};
