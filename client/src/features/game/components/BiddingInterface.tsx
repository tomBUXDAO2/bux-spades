import { useState, useEffect } from "react";
import { BiddingOption, Card } from "../../../types/game";

interface BiddingProps {
  onBid: (bid: number) => void;
  playerId: string;
  currentPlayerTurn: string;
  gameType: string;
  numSpades: number; // Number of spades in player's hand
  numHearts?: number; // Number of hearts in player's hand for BID HEARTS games
  allowNil?: boolean; // Add allowNil prop
  hasAceSpades?: boolean; // Add hasAceSpades prop for Whiz games
  gimmickType?: string; // Add gimmickType prop for Gimmick games
  partnerBid?: number; // Add partnerBid prop for Suicide games
  partnerBidValue?: number; // Add partnerBidValue prop to show partner's bid
  currentPlayerHand?: Card[]; // Add currentPlayerHand prop for CRAZY ACES
  myPlayerIndex?: number; // Add myPlayerIndex prop for WHIZ games
}

// Assign a unique class name for direct targeting
const modalContainerClass = "bidding-modal-container";
const modalContentClass = "bidding-modal-content";
const numberButtonClass = "bidding-number-button";
const bottomButtonClass = "bidding-bottom-button";

export default function BiddingInterface({ 
  onBid, 
  playerId, 
  currentPlayerTurn,
  gameType,
  numSpades,
  numHearts = 0, // Default to 0 for backward compatibility
  allowNil = true, // Default to true for backward compatibility
  hasAceSpades = false, // Default to false for backward compatibility
  gimmickType = undefined, // Default to undefined for backward compatibility
  partnerBid = undefined, // Default to undefined for backward compatibility
  partnerBidValue = undefined, // Default to undefined for backward compatibility
  currentPlayerHand = undefined, // Default to undefined for backward compatibility
  myPlayerIndex = -1 // Default to -1 for backward compatibility
}: BiddingProps) {
  const [selectedBid, setSelectedBid] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMyTurn = playerId === currentPlayerTurn;

  // For MIRROR games, automatically bid the number of spades
  useEffect(() => {
    
    if (gameType === "MIRROR") {
      setIsSubmitting(true);
      // In Mirror games: bid the number of spades in hand, or nil (0) if no spades
      const mirrorBid = numSpades > 0 ? numSpades : 0;
      onBid(mirrorBid);
    }
  }, [gameType, numSpades, onBid]);

  // For BID HEARTS games, automatically bid the number of hearts
  useEffect(() => {
    if (gimmickType === "BID HEARTS") {
      console.log("Auto-bidding in BID HEARTS game:", numHearts);
      setIsSubmitting(true);
      const heartsBid = numHearts > 0 ? numHearts : 0;
      console.log("[BID HEARTS DEBUG] Making bid:", heartsBid);
      onBid(heartsBid);
    }
  }, [gimmickType, numHearts, onBid]);

  // NOTE: BID 3 and CRAZY ACES auto-bidding is handled in GameStatusOverlay.tsx
  // Removed duplicate useEffect hooks that were causing double bid submissions
  const handleSubmit = (bid: number) => {
    setIsSubmitting(true);
    onBid(bid);
  };

  // Extra safeguard - hide if not my turn, if we're submitting, or if it's a MIRROR game
  if (!isMyTurn || isSubmitting || gameType === "MIRROR" || gimmickType === "BID HEARTS" || gimmickType === "BID 3" || gimmickType === "CRAZY ACES") {
    return null;
  }

  // For SUICIDE games, implement suicide bidding logic
  if (gimmickType === "SUICIDE") {
    const isFirstPartner = partnerBid === undefined;
    const partnerBidSomething = partnerBid !== undefined && partnerBid > 0;
    
    // If partner bid something, we must nil (no modal, auto-bid)
    if (!isFirstPartner && partnerBidSomething) {
      console.log('[SUICIDE DEBUG] Partner bid something, auto-bidding nil');
      setIsSubmitting(true);
      onBid(0); // Force nil
      return null;
    }
    
    // If first partner or partner bid nil, use standard bidding modal
    // Fall through to regular bidding interface (no special handling needed)
  }

  // For WHIZ games, compact inline bidding modal
  if (gameType === "WHIZ") {
    const hasAceSpades = currentPlayerHand ? currentPlayerHand.some(card => card.suit === "SPADES" && card.rank === "A") : false;
    const cannotBidNil = hasAceSpades;
    const isForcedNil = numSpades === 0;
    
    return (
      <div className={`${modalContainerClass} absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/3 z-[100020] pointer-events-auto`}>
        <div className={`${modalContentClass} w-[240px] md:w-[220px] sm:w-[200px] max-sm:w-[180px] backdrop-blur-md bg-gray-900/75 border border-white/20 rounded-2xl p-4 max-sm:p-3 shadow-xl`}>
          <div className="text-center mb-3 max-sm:mb-2">
            <h2 className="text-lg max-sm:text-base font-bold text-white">Make Your Bid</h2>
          </div>
          <div className="space-y-3">
            {/* Inline bid buttons */}
            <div className="flex justify-center gap-3">
              {!isForcedNil && (
                <button
                  onClick={() => setSelectedBid(numSpades)}
                  className={`${numberButtonClass} w-16 h-12 md:w-14 md:h-10 sm:w-12 sm:h-9 max-sm:w-11 max-sm:h-8 rounded-md text-2xl md:text-xl sm:text-lg max-sm:text-base font-bold transition-all flex items-center justify-center ${selectedBid === numSpades ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-black ring-2 ring-yellow-200 shadow-lg' : 'bg-gray-700/80 hover:bg-gray-600/90 text-white'}`}
                >
                  {numSpades}
                </button>
              )}
              <button
                onClick={() => !cannotBidNil && setSelectedBid(0)}
                disabled={cannotBidNil}
                className={`${numberButtonClass} w-16 h-12 md:w-14 md:h-10 sm:w-12 sm:h-9 max-sm:w-11 max-sm:h-8 rounded-md text-xl md:text-lg sm:text-base max-sm:text-sm font-bold transition-all flex items-center justify-center ${cannotBidNil ? "bg-gray-800/60 text-gray-500 cursor-not-allowed" : selectedBid === 0 ? "bg-gradient-to-br from-blue-500 to-blue-700 text-white ring-2 ring-blue-300 shadow-lg" : "bg-gray-700/80 hover:bg-gray-600/90 text-white"}`}
              >
                Nil
              </button>
            </div>
            {/* Confirm button */}
            <button
              onClick={() => selectedBid !== null && handleSubmit(selectedBid)}
              disabled={selectedBid === null}
              className={`${bottomButtonClass} w-full h-10 md:h-9 sm:h-8 max-sm:h-7 rounded-md text-base md:text-sm sm:text-xs max-sm:text-xs font-bold transition-all flex items-center justify-center ${selectedBid !== null ? 'bg-gradient-to-br from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  }

  // For 4 OR NIL games, compact inline bidding modal
  if (gameType === "4 OR NIL" || gimmickType === "4 OR NIL" || gimmickType === "BID4NIL") {
    const hasAceSpades = currentPlayerHand ? currentPlayerHand.some(card => card.suit === "SPADES" && card.rank === "A") : false;
    
    return (
      <div className={`${modalContainerClass} absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/3 z-[100020] pointer-events-auto`}>
        <div className={`${modalContentClass} w-[240px] md:w-[220px] sm:w-[200px] max-sm:w-[180px] backdrop-blur-md bg-gray-900/75 border border-white/20 rounded-2xl p-4 max-sm:p-3 shadow-xl`}>
          <div className="text-center mb-3 max-sm:mb-2">
            <h2 className="text-lg max-sm:text-base font-bold text-white">Make Your Bid</h2>
          </div>
          <div className="space-y-3">
            {/* Inline bid buttons */}
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setSelectedBid(4)}
                className={`${numberButtonClass} w-16 h-12 md:w-14 md:h-10 sm:w-12 sm:h-9 max-sm:w-11 max-sm:h-8 rounded-md text-2xl md:text-xl sm:text-lg max-sm:text-base font-bold transition-all flex items-center justify-center ${selectedBid === 4 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-black ring-2 ring-yellow-200 shadow-lg' : 'bg-gray-700/80 hover:bg-gray-600/90 text-white'}`}
              >
                4
              </button>
              <button
                onClick={() => !hasAceSpades && setSelectedBid(0)}
                disabled={hasAceSpades}
                className={`${numberButtonClass} w-16 h-12 md:w-14 md:h-10 sm:w-12 sm:h-9 max-sm:w-11 max-sm:h-8 rounded-md text-xl md:text-lg sm:text-base max-sm:text-sm font-bold transition-all flex items-center justify-center ${hasAceSpades ? "bg-gray-800/60 text-gray-500 cursor-not-allowed" : selectedBid === 0 ? "bg-gradient-to-br from-blue-500 to-blue-700 text-white ring-2 ring-blue-300 shadow-lg" : "bg-gray-700/80 hover:bg-gray-600/90 text-white"}`}
              >
                Nil
              </button>
            </div>
            {/* Confirm button */}
            <button
              onClick={() => selectedBid !== null && handleSubmit(selectedBid)}
              disabled={selectedBid === null}
              className={`${bottomButtonClass} w-full h-10 md:h-9 sm:h-8 max-sm:h-7 rounded-md text-base md:text-sm sm:text-xs max-sm:text-xs font-bold transition-all flex items-center justify-center ${selectedBid !== null ? 'bg-gradient-to-br from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  }

  // For BID 3 games, auto-bid 3 and show message on table
  if (gimmickType === "BID_3" || gimmickType === "BID 3" || gimmickType === "BID3") {
    console.log('[BID 3 DEBUG] Auto-bidding 3 for all players');
    setIsSubmitting(true);
    onBid(3);
    return null;
  }

  // For BID HEARTS games, auto-bid hearts count and show message on table
  if (gimmickType === "BID_HEARTS" || gimmickType === "BID HEARTS" || gimmickType === "BIDHEARTS") {
    console.log('[BID HEARTS DEBUG] Auto-bidding hearts count:', numHearts);
    setIsSubmitting(true);
    onBid(numHearts);
    return null;
  }

  // For CRAZY ACES games, auto-bid 3 for each ace and show message on table
  if (gimmickType === "CRAZY_ACES" || gimmickType === "CRAZY ACES") {
    // Count aces in the player's hand
    const acesCount = currentPlayerHand ? currentPlayerHand.filter(card => card.rank === 'A').length : 0;
    const bidAmount = acesCount * 3;
    console.log('[CRAZY ACES DEBUG] Auto-bidding 3 for each ace:', acesCount, 'aces =', bidAmount);
    setIsSubmitting(true);
    onBid(bidAmount);
    return null;
  }


  // For other game types (REGULAR, SOLO), return the original bidding interface
  return (
    <>
      <div className={`${modalContainerClass} absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/3 z-[100020] pointer-events-auto`}>
        <div className={`${modalContentClass} w-[420px] md:w-[400px] sm:w-[360px] max-sm:w-[280px] backdrop-blur-md bg-gray-900/75 border border-white/20 rounded-2xl p-3 max-sm:p-2 shadow-xl`}>
          <div className="text-center mb-2 max-sm:mb-1">
            <h2 className="text-lg max-sm:text-base font-bold text-white">Make Your Bid</h2>
            {partnerBidValue !== undefined && (
              <p className="text-sm max-sm:text-xs text-blue-300">Partner bid: {partnerBidValue}</p>
            )}
          </div>

          <div className="space-y-2 max-sm:space-y-1.5">
            {/* Row 1: Nil, 1-6 */}
            <div className="flex justify-center gap-2 max-sm:gap-1">
              {allowNil && (
                <button
              onClick={() => !hasAceSpades && setSelectedBid(0)}
              disabled={hasAceSpades}
              className={`${numberButtonClass} w-12 h-9 md:w-11 md:h-8 sm:w-10 sm:h-7 max-sm:w-9 max-sm:h-6 rounded-md text-base md:text-sm sm:text-xs max-sm:text-xs font-bold transition-all flex items-center justify-center ${hasAceSpades ? "bg-gray-800/60 text-gray-500 cursor-not-allowed" : selectedBid === 0 ? "bg-gradient-to-br from-blue-500 to-blue-700 text-white ring-2 ring-blue-300 shadow-lg" : "bg-gray-700/80 hover:bg-gray-600/90 text-white"}`}
            >
              Nil                </button>
              )}
              {[1, 2, 3, 4, 5, 6].map((bid) => (
                <button
                  key={bid}
                  onClick={() => setSelectedBid(bid)}
                  className={`${numberButtonClass} w-12 h-9 md:w-11 md:h-8 sm:w-10 sm:h-7 max-sm:w-9 max-sm:h-6 rounded-md text-base md:text-sm sm:text-xs max-sm:text-xs font-bold transition-all flex items-center justify-center flex-shrink-0 ${selectedBid === bid ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-black ring-2 ring-yellow-200 shadow-lg' : 'bg-gray-700/80 hover:bg-gray-600/90 text-white'}`}
                >
                  {bid}
                </button>
              ))}
            </div>

            {/* Row 2: 7-13 */}
            <div className="flex justify-center gap-2 max-sm:gap-1">
              {[7, 8, 9, 10, 11, 12, 13].map((bid) => (
                <button
                  key={bid}
                  onClick={() => setSelectedBid(bid)}
                  className={`${numberButtonClass} w-12 h-9 md:w-11 md:h-8 sm:w-10 sm:h-7 max-sm:w-9 max-sm:h-6 rounded-md text-base md:text-sm sm:text-xs max-sm:text-xs font-bold transition-all flex items-center justify-center flex-shrink-0 ${selectedBid === bid ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-black ring-2 ring-yellow-200 shadow-lg' : 'bg-gray-700/80 hover:bg-gray-600/90 text-white'}`}
                >
                  {bid}
                </button>
              ))}
            </div>

            {/* Row 3: Confirm */}
            <div className="flex justify-center mt-2">
              <button
                onClick={() => selectedBid !== null && handleSubmit(selectedBid)}
                disabled={selectedBid === null}
                className={`${bottomButtonClass} px-8 h-9 md:px-6 md:h-8 sm:px-4 sm:h-7 max-sm:px-3 max-sm:h-6 rounded-md text-base md:text-sm sm:text-xs max-sm:text-xs font-bold transition-all flex items-center justify-center ${selectedBid !== null ? 'bg-gradient-to-br from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
} 