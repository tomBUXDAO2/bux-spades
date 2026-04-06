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

export type CardDimensionOpts = {
  /** Larger hand + peek layout on phones (PlayerHand); table/trick use default mobile size. */
  mobileHandPeeking?: boolean;
};

/**
 * Calculate card dimensions based on screen size and scale factor
 */
export const getCardDimensions = (
  isMobile: boolean,
  scaleFactor: number,
  opts?: CardDimensionOpts
): CardDimensions => {
  const mobileMult = isMobile && opts?.mobileHandPeeking ? 2 : 1;
  const cardUIWidth = Math.floor(
    isMobile
      ? 55 * mobileMult
      : (window.innerWidth >= 900 && window.innerWidth <= 1300 ? 100 : 120) * scaleFactor
  );
  const cardUIHeight = Math.floor(
    isMobile
      ? 77 * mobileMult
      : (window.innerWidth >= 900 && window.innerWidth <= 1300 ? 140 : 168) * scaleFactor
  );

  return { cardUIWidth, cardUIHeight };
};

/**
 * Calculate card overlap offset so N cards span the available width (fan / stacked hand).
 */
export const getCardOverlapOffset = (
  scaleFactor: number,
  isMobile: boolean = false,
  numCards: number = 13,
  opts?: CardDimensionOpts
): number => {
  const width = window.innerWidth;
  /** Must match GameTable `useSlideOutGameChat` (width < 1024): game column is full width, not 70%. */
  const gameColumnFullWidth = width < 1024;
  const useFullWidthForHand = isMobile || gameColumnFullWidth;
  const sidePad = useFullWidthForHand ? 16 : 0;
  const availableWidth = (useFullWidthForHand ? width : width * 0.7) - sidePad;

  const cardDimensions = getCardDimensions(isMobile, scaleFactor, opts);
  const cardWidth = cardDimensions.cardUIWidth;

  const n = Math.max(1, numCards);
  const totalGaps = n - 1;
  if (totalGaps <= 0) return 0;
  const visibleCardWidth = (availableWidth - cardWidth) / totalGaps;
  const calculatedOverlap = visibleCardWidth - cardWidth;

  return Math.floor(calculatedOverlap);
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
  scaleFactor: number,
  numCards: number = 13,
  opts?: CardDimensionOpts
): CardDimensions & { overlapOffset: number } => {
  const cardDimensions = getCardDimensions(isMobile, scaleFactor, opts);
  const overlapOffset = getCardOverlapOffset(scaleFactor, isMobile, numCards, opts);

  return {
    cardUIWidth: cardDimensions.cardUIWidth,
    cardUIHeight: cardDimensions.cardUIHeight,
    overlapOffset,
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
