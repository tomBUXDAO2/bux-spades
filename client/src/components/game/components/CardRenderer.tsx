// Card rendering components for GameTable
// Handles player hand, spectator hand, and card images

import React from 'react';
import { motion } from 'framer-motion';
import { isCompactGameLayout } from '../../../hooks/windowLayout';
import type { Card, GameState, Player, Bot } from "../../../types/game";
import {
  getCardDimensions,
  getHandFanOverlapOffset,
  getCardVisibility,
  getSpectatorHandDimensions,
  type CardDimensionOpts,
} from '../../../features/game/utils/cardUtils';
import { sortCards, getPlayableCards, hasSpadeBeenPlayed } from '../../../features/game/utils/gameUtils';

/** Soft left-edge darkening between stacked hand cards (mobile + desktop). */
const HAND_OVERLAP_FADE_SHADOW =
  'inset 36px 0 44px -18px rgba(0, 0, 0, 0.16), inset 20px 0 30px -10px rgba(0, 0, 0, 0.12), inset 8px 0 18px -4px rgba(0, 0, 0, 0.08)';
const HAND_STRIP_AMBIENT_SHADOW = 'drop-shadow(0 10px 28px rgba(0, 0, 0, 0.45))';

interface CardRendererProps {
  gameState: GameState;
  myHand: Card[];
  currentPlayerId: string;
  isMobile: boolean;
  scaleFactor: number;
  cardsRevealed: boolean;
  dealingComplete: boolean;
  dealtCardCount: number;
  currentTrick: Card[];
  trickCompleted: boolean;
  onPlayCard: (card: Card) => void;
  isPlayer: (p: Player | Bot | null) => p is Player;
  isBot: (p: Player | Bot | null) => p is Bot;
  isPlayingCard?: boolean;
}

/** PNG cards scale cleanly; CSS rank/suit on tiny cards + HiDPR + parent transforms looks blurry. */
function shouldUseBitmapPlayingCards(): boolean {
  if (typeof window === 'undefined') return true;
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w >= 900 && h > 449) return true;
  if (w < 1024) return true;
  if (h <= 480) return true;
  if (window.devicePixelRatio >= 2) return true;
  return false;
}

// Optimized card image component - no loading states during gameplay
export const CardImage = ({ card, width, height, className, alt, faceDown = false, style }: {
  card: Card;
  width: number;
  height: number;
  className?: string;
  alt?: string;
  faceDown?: boolean;
  style?: React.CSSProperties;
}) => {
  const useBitmap = shouldUseBitmapPlayingCards();
  const imgW = Math.max(1, Math.round(width) - 2);
  const imgH = Math.max(1, Math.round(height));

  if (faceDown) {
    return (
      <div
        className={`${className} bg-blue-800 border-4 border-white rounded-lg relative overflow-hidden`}
        style={{ width: Math.round(width), height: Math.round(height), ...style }}
      >
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0" style={{
            backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, white 10px, white 12px), repeating-linear-gradient(-45deg, transparent, transparent 10px, white 10px, white 12px)"
          }}></div>
        </div>
      </div>
    );
  }

  if (useBitmap) {
    return (
      <img
        src={`/optimized/cards/${getCardImage(card)}`}
        alt={alt || `${card.rank}${card.suit}`}
        className={className}
        draggable={false}
        style={{
          width: imgW,
          height: imgH,
          objectFit: 'contain',
          padding: 0,
          margin: 0,
          borderRadius: '8px',
          display: 'block',
          ...style,
        }}
      />
    );
  }

  // CSS-based cards (low-DPR desktop windows only in practice)
  const getSuitSymbol = (suit: string) => {
    const suitMap: Record<string, string> = {
      "♠": "♠️", "Spades": "♠️", "spades": "♠️", "SPADES": "♠️", "Spade": "♠️", "spade": "♠️", "SPADE": "♠️", "S": "♠️",
      "♥": "♥️", "Hearts": "♥️", "hearts": "♥️", "HEARTS": "♥️", "Heart": "♥️", "heart": "♥️", "HEART": "♥️", "H": "♥️",
      "♦": "♦️", "Diamonds": "♦️", "diamonds": "♦️", "DIAMONDS": "♦️", "Diamond": "♦️", "diamond": "♦️", "DIAMOND": "♦️", "D": "♦️",
      "♣": "♣️", "Clubs": "♣️", "clubs": "♣️", "CLUBS": "♣️", "Club": "♣️", "club": "♣️", "CLUB": "♣️", "C": "♣️",
    };
    return suitMap[suit] || suit;
  };

  const getSuitColor = (suit: string) => {
    const suitMap: Record<string, string> = {
      '♠': 'text-black', 'Spades': 'text-black', 'S': 'text-black',
      '♥': 'text-red-600', 'Hearts': 'text-red-600', 'H': 'text-red-600',
      '♦': 'text-red-600', 'Diamonds': 'text-red-600', 'D': 'text-red-600',
      '♣': 'text-black', 'Clubs': 'text-black', 'C': 'text-black',
    };
    return suitMap[suit] || 'text-black';
  };

  const suitSymbol = getSuitSymbol(card.suit);
  const suitColor = getSuitColor(card.suit);

  // Determine if this is a table card (smaller) or hand card (larger)
  const isTableCard = width <= 70; // Table cards are typically 60-70px wide, hand cards are larger
  const isVerySmallTableCard = height <= 65; // Very small table cards need extra small text
  
  const isMobileLayout = isCompactGameLayout(window.innerWidth, window.innerHeight);
  
  // Adjust sizing based on card type and screen size
  const cornerRankSize = isTableCard 
    ? (isVerySmallTableCard ? 'text-xs' : (isMobileLayout ? 'text-xs' : 'text-sm'))
    : (isMobileLayout ? 'text-xl' : 'text-base');
  const cornerSuitSize = isTableCard 
    ? (isVerySmallTableCard ? 'text-xs' : (isMobileLayout ? 'text-xs' : 'text-xs'))
    : (isMobileLayout ? 'text-lg' : 'text-xs');
  const centerSuitSize = isTableCard 
    ? (isVerySmallTableCard ? 'text-base' : (isMobileLayout ? 'text-lg' : 'text-2xl'))
    : (isMobileLayout ? 'text-3xl' : 'text-3xl');
  const cornerPosition = isTableCard 
    ? (isVerySmallTableCard ? 'top-0.5 left-0.5' : (isMobileLayout ? 'top-0.5 left-0.5' : 'top-0.5 left-0.5'))
    : (isMobileLayout ? 'top-1 left-1' : 'top-1 left-1');
  const cornerWidth = isTableCard 
    ? (isVerySmallTableCard ? 'w-2' : (isMobileLayout ? 'w-3' : 'w-5'))
    : (isMobileLayout ? 'w-6' : 'w-6');

  return (
    <div
      className={`${className} bg-white relative overflow-hidden rounded-lg antialiased`}
      style={{
        width: Math.round(width),
        height: Math.round(height),
        WebkitFontSmoothing: 'antialiased',
        ...style,
      }}
      title={alt || `${card.rank}${card.suit}`}
    >
      {/* Top left corner */}
      <div className={`absolute ${cornerPosition} font-bold ${cornerWidth} text-center`}>
        <div className={`${suitColor} leading-tight ${cornerRankSize}`} style={{ fontSize: isVerySmallTableCard ? '0.6rem' : '0.8rem' }}>{card.rank}</div>
        <div className={`${suitColor} leading-tight ${cornerSuitSize}`} style={{ fontSize: isVerySmallTableCard ? '0.4rem' : '0.6rem' }}>{suitSymbol}</div>
      </div>

      {/* Center large suit */}
      <div className={`absolute inset-0 flex items-center justify-center ${suitColor}`}>
        <div className={`${centerSuitSize} font-bold`}>{suitSymbol}</div>
      </div>

      {/* Bottom right corner (rotated) */}
      <div className={`absolute ${isTableCard ? (isMobileLayout ? 'bottom-0.5 right-0.5' : 'bottom-0.5 right-0.5') : (isMobileLayout ? 'bottom-1 right-1' : 'bottom-1 right-1')} font-bold ${cornerWidth} text-center transform rotate-180`}>
        <div className={`${suitColor} leading-tight ${cornerRankSize}`} style={{ fontSize: isVerySmallTableCard ? '0.6rem' : '0.8rem' }}>{card.rank}</div>
        <div className={`${suitColor} leading-tight ${cornerSuitSize}`} style={{ fontSize: isVerySmallTableCard ? '0.4rem' : '0.6rem' }}>{suitSymbol}</div>
      </div>
    </div>
  );
};

// Get card image filename from card data
const getCardImage = (card: Card): string => {
  const rank = card.rank;
  // Convert Unicode suit symbols to single letters for PNG filenames
  const suitMap: Record<string, string> = {
    "♠": "S", "SPADES": "S", "Spades": "S", "spades": "S", "S": "S",
    "♥": "H", "HEARTS": "H", "Hearts": "H", "hearts": "H", "H": "H", 
    "♦": "D", "DIAMONDS": "D", "Diamonds": "D", "diamonds": "D", "D": "D",
    "♣": "C", "CLUBS": "C", "Clubs": "C", "clubs": "C", "C": "C"
  };
  const suit = suitMap[card.suit] || card.suit;
  return `${rank}${suit}.png`;
};

// Player hand renderer
export const PlayerHandRenderer: React.FC<CardRendererProps> = ({
  gameState,
  myHand,
  currentPlayerId,
  isMobile,
  scaleFactor,
  cardsRevealed,
  dealingComplete,
  dealtCardCount,
  currentTrick,
  trickCompleted,
  onPlayCard,
  isPlayingCard = false
}) => {
  if (!myHand || myHand.length === 0) return null;

  const handOpts: CardDimensionOpts | undefined = isMobile ? { mobileHandPeeking: true } : undefined;
  const sortedHand = sortCards(myHand);
  const isLeadingTrick = currentTrick && Array.isArray(currentTrick) && currentTrick.length === 0;
  const playableCards = gameState.status === "PLAYING" && myHand ? getPlayableCards(gameState, myHand, isLeadingTrick, trickCompleted, currentTrick) : [];
  
  const isMyTurn = (gameState.status === "PLAYING" || gameState.status === "BIDDING") && gameState.currentPlayer === currentPlayerId;
  
  // Defensive: only use myHand and playableCards if defined
  let effectivePlayableCards: typeof myHand = [];
  if (isMyTurn && Array.isArray(myHand)) {
    // CRITICAL FIX: Use gameState.play.currentTrick as source of truth, not the prop which might be stale
    const actualCurrentTrick = (gameState as any).play?.currentTrick || currentTrick || [];
    const isLeading = Array.isArray(actualCurrentTrick) && actualCurrentTrick.length === 0;
    
    // CRITICAL: Use hasSpadeBeenPlayed function which has the cache logic
    // Don't recalculate separately - trust the cached result
    const spadesActuallyPlayed = hasSpadeBeenPlayed(gameState);
    
    // CRITICAL FIX: Always use getPlayableCards for proper rule validation
    // Use actualCurrentTrick (from gameState) as source of truth, not stale prop
    effectivePlayableCards = getPlayableCards(gameState, myHand, isLeading, trickCompleted, actualCurrentTrick);
    
    // DEBUG: Log what getPlayableCards returned when leading
    if (isLeading) {
      const spadesInPlayable = effectivePlayableCards.filter((c: any) => c.suit === 'SPADES');
      console.log('[CARD RENDERER] getPlayableCards result when leading:', {
        totalPlayable: effectivePlayableCards.length,
        spadesInPlayable: spadesInPlayable.length,
        spadesCards: spadesInPlayable.map((c: any) => `${c.suit}${c.rank}`),
        allPlayableSuits: [...new Set(effectivePlayableCards.map((c: any) => c.suit))]
      });
    }

    // Enforce assassin leading rule explicitly to avoid any edge-case empty sets
    try {
      const specialRules: any = (gameState as any).specialRules || {};
      const rule1 = specialRules.specialRule1 || (specialRules.assassin ? 'ASSASSIN' : (specialRules.screamer ? 'SCREAMER' : 'NONE'));
      const secretSeat = (gameState as any).play?.secretAssassinSeat ?? specialRules.secretAssassinSeat;
      let mySeatIndex: number | null = null;
      try {
        const hands = (gameState as any).hands as Card[][] | undefined;
        if (hands && Array.isArray(hands)) {
          for (let i = 0; i < hands.length; i++) {
            const h = hands[i] || [];
            if (h.length === myHand.length) {
              const key = (c: Card) => `${c.suit}-${c.rank}`;
              const a = new Set(myHand.map(key));
              const b = new Set(h.map(key));
              if (a.size === b.size && [...a].every(k => b.has(k))) { mySeatIndex = i; break; }
            }
          }
        }
      } catch {}
      const isAssassinSeat = (rule1 === 'ASSASSIN') || (rule1 === 'SECRET_ASSASSIN' && (mySeatIndex === secretSeat));
      
      // CRITICAL FIX: Use spadesActuallyPlayed from hasSpadeBeenPlayed which has the cache
      // This ensures consistency with getPlayableCards
      if (isLeading && isAssassinSeat) {
        if (spadesActuallyPlayed) {
          // Only spades are legal when leading as assassin after broken
          const spades = myHand.filter((c: any) => c.suit === 'SPADES');
          effectivePlayableCards = spades.length > 0 ? spades : myHand;
        } else {
          // CRITICAL: Spades cannot be led before broken; allow any non-spade
          // This prevents UI from allowing spades that server will reject
          const nonSpades = myHand.filter((c: any) => c.suit !== 'SPADES');
          effectivePlayableCards = nonSpades.length > 0 ? nonSpades : myHand;
        }
      }
    } catch {}

    // SAFETY NET: If rule engine returns empty on my turn, ensure at least legal non-spades (or any suit if only spades)
    if (Array.isArray(effectivePlayableCards) && effectivePlayableCards.length === 0 && gameState.status === 'PLAYING') {
      const hasNonSpades = myHand.some((c: any) => c.suit !== 'SPADES');
      // Use spadesActuallyPlayed from hasSpadeBeenPlayed which has cache
      if (!spadesActuallyPlayed) {
        effectivePlayableCards = hasNonSpades ? myHand.filter((c: any) => c.suit !== 'SPADES') : myHand;
      } else {
        effectivePlayableCards = myHand;
      }
    }
  } else if (Array.isArray(playableCards)) {
    effectivePlayableCards = playableCards;
  }
  
  const cardDimensions = getCardDimensions(isMobile, scaleFactor, handOpts);
  const cardOverlapOffset = getHandFanOverlapOffset(scaleFactor, isMobile, handOpts);
  const { showAllCards, visibleCount } = getCardVisibility(sortedHand, gameState.status, dealingComplete, dealtCardCount);
  const peekHalfH = Math.ceil(cardDimensions.cardUIHeight / 2);
  const handStripHeight = isMobile
    ? peekHalfH + 14
    : Math.floor(window.innerWidth >= 900 && window.innerWidth <= 1300 ? 160 : 188);

  return (
    <div
      className={`absolute flex justify-center ${isMobile ? '' : 'inset-x-0'}`}
      style={{
        ...(isMobile
          ? {
              bottom: 0,
              top: 'auto',
              left: '50%',
              width: '100vw',
              maxWidth: '100dvw',
              transform: 'translateX(-50%)',
            }
          : { top: '50%', left: 0, right: 0, transform: 'translateY(-50%)' }),
        height: `${handStripHeight}px`,
        paddingTop: '0px',
        paddingBottom: '0px',
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 50,
        filter: HAND_STRIP_AMBIENT_SHADOW,
      }}
    >
      <div
        className={`flex h-full w-full ${isMobile ? 'items-end justify-center' : 'items-center justify-center'}`}
      >
        <div className="flex shrink-0 items-center">
        {(sortedHand && Array.isArray(sortedHand) ? sortedHand : []).map((card: Card, index: number) => {
          // Respect rule engine: do not block cards that are deemed playable
          const onLead = Array.isArray(currentTrick) && currentTrick.length === 0;
          const leadingSpadeBlocked = false;

          const basePlayable = !isPlayingCard && ((gameState.status === "PLAYING" &&
            gameState.currentPlayer === currentPlayerId &&
            Array.isArray(effectivePlayableCards) && effectivePlayableCards.some((c: Card) => c.suit === card.suit && c.rank === card.rank)) ||
            (gameState.status === "BIDDING" && gameState.currentPlayer === currentPlayerId));

          const isPlayable = basePlayable && !leadingSpadeBlocked;
          const isVisible = index < visibleCount;
          const dimUnplayable =
            (!isPlayable || isPlayingCard) && gameState.currentPlayer === currentPlayerId;
          const playableLift = isPlayable && !isPlayingCard;
          const stackZ = playableLift ? 800 + index : index;
          const dealingFan = gameState.status === 'BIDDING' && !dealingComplete;

          return (
            <motion.div
              key={`${card.suit}${card.rank}`}
              className={`relative ${playableLift ? 'cursor-pointer' : 'cursor-not-allowed'} ${dimUnplayable ? 'pointer-events-none' : ''}`}
              style={{
                width: `${cardDimensions.cardUIWidth}px`,
                height: `${isMobile ? peekHalfH : cardDimensions.cardUIHeight}px`,
                marginLeft: index > 0 ? `${cardOverlapOffset}px` : '0',
                zIndex: stackZ,
                pointerEvents: 'auto',
              }}
              initial={false}
              animate={{
                opacity: !isVisible ? 0 : 1,
                y: isVisible ? 0 : dealingFan ? 10 : 18,
                x: dealingFan ? (isVisible ? 0 : -36 - index * 3) : 0,
                rotate: isVisible ? 0 : dealingFan ? -6 : -2,
                scale: isVisible ? 1 : dealingFan ? 0.94 : 1,
              }}
              transition={{
                type: 'spring',
                stiffness: dealingFan ? 320 : 400,
                damping: dealingFan ? 22 : 24,
                mass: dealingFan ? 0.85 : 1,
              }}
              whileHover={
                playableLift
                  ? isMobile
                    ? { y: -8, zIndex: 950, transition: { type: 'spring', stiffness: 400, damping: 22 } }
                    : { y: -10, scale: 1.03, zIndex: 950, transition: { type: 'spring', stiffness: 400, damping: 22 } }
                  : undefined
              }
              whileTap={playableLift && !isMobile ? { scale: 0.97 } : undefined}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isPlayable && gameState.status === "PLAYING") {
                  onPlayCard(card);
                }
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onMouseUp={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <div
                className={`relative m-0 rounded-lg p-0 ${isMobile ? 'overflow-hidden' : ''}`}
                style={{
                  padding: 0,
                  margin: 0,
                  lineHeight: 0,
                  boxSizing: 'border-box',
                  boxShadow: index > 0 ? HAND_OVERLAP_FADE_SHADOW : 'none',
                  width: `${cardDimensions.cardUIWidth}px`,
                  height: isMobile ? `${peekHalfH}px` : undefined,
                }}
              >
                <CardImage
                  card={card}
                  width={cardDimensions.cardUIWidth}
                  height={cardDimensions.cardUIHeight}
                  className={isPlayable ? 'hover:opacity-95' : ''}
                  style={
                    index > 0
                      ? { filter: 'drop-shadow(-12px 0 20px rgba(0, 0, 0, 0.22))' }
                      : undefined
                  }
                  alt={`${card.rank}${card.suit}`}
                  faceDown={
                    // CRITICAL: During PLAYING, hand cards should NEVER be face down
                    // During bidding, show cards face up when cardsRevealed is true
                    // Also keep face down if dealing is not complete or card hasn't been dealt yet
                    gameState.status === "PLAYING" ? false :
                    (gameState.status === "BIDDING" && !cardsRevealed) || 
                    (!dealingComplete && index >= dealtCardCount)
                  }
                />
                {dimUnplayable && (
                  <div
                    className="absolute inset-0 rounded-lg bg-slate-950/55 pointer-events-none ring-1 ring-black/20"
                    aria-hidden
                  />
                )}
              </div>
            </motion.div>
          );
        })}
        </div>
      </div>
    </div>
  );
};

// Spectator hand renderer
export const SpectatorHandRenderer: React.FC<{
  gameState: GameState;
  isMobile: boolean;
  scaleFactor: number;
}> = ({ gameState, isMobile, scaleFactor }) => {
  const bottomPlayerIndex = 0;
  const bottomPlayerHand = (gameState as any)?.hands?.[bottomPlayerIndex] || [];
  
  if (!bottomPlayerHand || bottomPlayerHand.length === 0) return null;

  const handOpts: CardDimensionOpts | undefined = isMobile ? { mobileHandPeeking: true } : undefined;
  const spectatorHandDimensions = getSpectatorHandDimensions(
    isMobile,
    scaleFactor,
    bottomPlayerHand.length,
    handOpts
  );
  const { cardUIWidth, cardUIHeight, overlapOffset } = spectatorHandDimensions;
  const peekHalfH = Math.ceil(cardUIHeight / 2);
  const handStripHeight = isMobile
    ? peekHalfH + 14
    : Math.floor(window.innerWidth >= 900 && window.innerWidth <= 1300 ? 160 : 188);

  return (
    <div
      className={`absolute flex justify-center ${isMobile ? '' : 'inset-x-0'}`}
      style={{
        ...(isMobile
          ? {
              bottom: 0,
              top: 'auto',
              left: '50%',
              width: '100vw',
              maxWidth: '100dvw',
              transform: 'translateX(-50%)',
            }
          : { top: '50%', left: 0, right: 0, transform: 'translateY(-50%)' }),
        height: `${handStripHeight}px`,
        paddingTop: '0px',
        paddingBottom: '0px',
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 50,
        filter: HAND_STRIP_AMBIENT_SHADOW,
      }}
    >
      <div
        className={`flex h-full w-full ${isMobile ? 'items-end justify-center' : 'items-center justify-center'}`}
      >
        <div className="flex shrink-0 items-center">
        {Array.isArray(bottomPlayerHand) && bottomPlayerHand.map((card: Card, index: number) => (
          <div
            key={`${card.suit}${card.rank}`}
            className={`relative m-0 rounded-lg p-0 ${isMobile ? 'overflow-hidden' : ''}`}
            style={{
              width: `${cardUIWidth}px`,
              height: `${isMobile ? peekHalfH : cardUIHeight}px`,
              marginLeft: index > 0 ? `${overlapOffset}px` : '0',
              zIndex: 50 + index,
              pointerEvents: 'auto',
              lineHeight: 0,
              boxSizing: 'border-box',
              boxShadow: index > 0 ? HAND_OVERLAP_FADE_SHADOW : 'none',
            }}
          >
            <CardImage
              card={card}
              width={cardUIWidth}
              height={cardUIHeight}
              className=""
              style={
                index > 0
                  ? { filter: 'drop-shadow(-12px 0 20px rgba(0, 0, 0, 0.22))' }
                  : undefined
              }
              alt="Face down card"
              faceDown={true}
            />
          </div>
        ))}
        </div>
      </div>
    </div>
  );
};
