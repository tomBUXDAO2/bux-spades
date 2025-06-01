import { useState, useEffect } from "react";
import { GameType } from "@/types/game";

interface BiddingProps {
  onBid: (bid: number) => void;
  currentBid?: number;
  gameId: string;
  playerId: string;
  currentPlayerTurn: string;
  gameType: GameType;
  numSpades: number; // Number of spades in player's hand
  isCurrentPlayer: boolean;
  allowNil?: boolean; // Add allowNil prop
}

// Assign a unique class name for direct targeting
const modalContainerClass = "bidding-modal-container";
const modalContentClass = "bidding-modal-content";
const numberButtonClass = "bidding-number-button";
const bottomButtonClass = "bidding-bottom-button";

export default function BiddingInterface({ 
  onBid, 
  currentBid, 
  gameId, 
  playerId, 
  currentPlayerTurn,
  gameType,
  numSpades,
  isCurrentPlayer,
  allowNil = true // Default to true for backward compatibility
}: BiddingProps) {
  const [selectedBid, setSelectedBid] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNilConfirmation, setShowNilConfirmation] = useState(false);
  const isMyTurn = playerId === currentPlayerTurn;

  // For MIRROR games, automatically bid the number of spades
  useEffect(() => {
    if (gameType === "MIRROR" && isMyTurn) {
      console.log('Auto-bidding in MIRROR game:', numSpades);
      setIsSubmitting(true);
      onBid(numSpades);
    }
  }, [gameType, isMyTurn, numSpades, onBid]);

  const handleSubmit = (bid: number) => {
    setIsSubmitting(true);
    onBid(bid);
  };

  // Extra safeguard - hide if not my turn, if we're submitting, or if it's a MIRROR game
  if (!isMyTurn || isSubmitting || gameType === "MIRROR") {
    return null;
  }

  // For WHIZ games, show spades count and nil options
  if (gameType === "WHIZ") {
    return (
      <div className={`${modalContainerClass} absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50`}>
        <div className={`${modalContentClass} w-[380px] md:w-[360px] sm:w-[320px] max-sm:w-[280px] backdrop-blur-md bg-gray-900/75 border border-white/10 rounded-2xl p-4 max-sm:p-3 shadow-xl`}>
          <div className="text-center mb-3 max-sm:mb-2">
            <h2 className="text-lg max-sm:text-base font-bold text-white">Make Your Bid</h2>
            <p className="text-sm max-sm:text-xs text-gray-300">You have {numSpades} spades</p>
          </div>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setSelectedBid(numSpades)}
              className={`${numberButtonClass} px-6 h-12 md:h-10 sm:h-9 max-sm:h-8 rounded-md text-xl md:text-lg sm:text-base max-sm:text-sm font-bold transition-all flex items-center justify-center ${selectedBid === numSpades ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-black ring-2 ring-yellow-200 shadow-lg' : 'bg-gray-700/80 hover:bg-gray-600/90 text-white'}`}
            >
              Bid {numSpades}
            </button>
            <button
              onClick={() => setSelectedBid(0)}
              className={`${numberButtonClass} px-6 h-12 md:h-10 sm:h-9 max-sm:h-8 rounded-md text-xl md:text-lg sm:text-base max-sm:text-sm font-bold transition-all flex items-center justify-center ${selectedBid === 0 ? 'bg-gradient-to-br from-blue-500 to-blue-700 text-white ring-2 ring-blue-300 shadow-lg' : 'bg-gray-700/80 hover:bg-gray-600/90 text-white'}`}
            >
              Nil
            </button>
            <button
              onClick={() => selectedBid !== null && handleSubmit(selectedBid)}
              disabled={selectedBid === null}
              className={`${bottomButtonClass} px-6 h-12 md:h-10 sm:h-9 max-sm:h-8 rounded-md text-xl md:text-lg sm:text-base max-sm:text-sm font-bold transition-all flex items-center justify-center ${selectedBid !== null ? 'bg-gradient-to-br from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  }

  // For other game types (REGULAR, SOLO), return the original bidding interface
  return (
    <>
      <div className={`${modalContainerClass} absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50`}>
        <div className={`${modalContentClass} w-[380px] md:w-[360px] sm:w-[320px] max-sm:w-[280px] backdrop-blur-md bg-gray-900/75 border border-white/10 rounded-2xl p-4 max-sm:p-3 shadow-xl`}>
          <div className="text-center mb-3 max-sm:mb-2">
            <h2 className="text-lg max-sm:text-base font-bold text-white">Make Your Bid</h2>
            {currentBid !== undefined && (
              <p className="text-sm max-sm:text-xs text-gray-300">Current bid: {currentBid}</p>
            )}
          </div>

          <div className="space-y-2 max-sm:space-y-1.5">
            {/* Row 1: 1-4 */}
            <div className="flex justify-center gap-3 max-sm:gap-2">
              {[1, 2, 3, 4].map((bid) => (
                <button
                  key={bid}
                  onClick={() => setSelectedBid(bid)}
                  className={`${numberButtonClass} w-16 h-12 md:w-14 md:h-10 sm:w-12 sm:h-9 max-sm:w-11 max-sm:h-8 rounded-md text-xl md:text-lg sm:text-base max-sm:text-sm font-bold transition-all flex items-center justify-center flex-shrink-0 ${selectedBid === bid ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-black ring-2 ring-yellow-200 shadow-lg' : 'bg-gray-700/80 hover:bg-gray-600/90 text-white'}`}
                >
                  {bid}
                </button>
              ))}
            </div>

            {/* Row 2: 5-9 */}
            <div className="flex justify-center gap-3 max-sm:gap-2">
              {[5, 6, 7, 8, 9].map((bid) => (
                <button
                  key={bid}
                  onClick={() => setSelectedBid(bid)}
                  className={`${numberButtonClass} w-16 h-12 md:w-14 md:h-10 sm:w-12 sm:h-9 max-sm:w-11 max-sm:h-8 rounded-md text-xl md:text-lg sm:text-base max-sm:text-sm font-bold transition-all flex items-center justify-center flex-shrink-0 ${selectedBid === bid ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-black ring-2 ring-yellow-200 shadow-lg' : 'bg-gray-700/80 hover:bg-gray-600/90 text-white'}`}
                >
                  {bid}
                </button>
              ))}
            </div>

            {/* Row 3: 10-13 */}
            <div className="flex justify-center gap-3 max-sm:gap-2">
              {[10, 11, 12, 13].map((bid) => (
                <button
                  key={bid}
                  onClick={() => setSelectedBid(bid)}
                  className={`${numberButtonClass} w-16 h-12 md:w-14 md:h-10 sm:w-12 sm:h-9 max-sm:w-11 max-sm:h-8 rounded-md text-xl md:text-lg sm:text-base max-sm:text-sm font-bold transition-all flex items-center justify-center flex-shrink-0 ${selectedBid === bid ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-black ring-2 ring-yellow-200 shadow-lg' : 'bg-gray-700/80 hover:bg-gray-600/90 text-white'}`}
                >
                  {bid}
                </button>
              ))}
            </div>

            {/* Bottom row: Nil and Submit */}
            <div className="flex justify-center gap-3 max-sm:gap-2 mt-3">
              {allowNil && (
                <button
                  onClick={() => setSelectedBid(0)}
                  className={`${numberButtonClass} px-6 h-12 md:h-10 sm:h-9 max-sm:h-8 rounded-md text-xl md:text-lg sm:text-base max-sm:text-sm font-bold transition-all flex items-center justify-center ${selectedBid === 0 ? 'bg-gradient-to-br from-blue-500 to-blue-700 text-white ring-2 ring-blue-300 shadow-lg' : 'bg-gray-700/80 hover:bg-gray-600/90 text-white'}`}
                >
                  Nil
                </button>
              )}
              <button
                onClick={() => selectedBid !== null && handleSubmit(selectedBid)}
                disabled={selectedBid === null}
                className={`${bottomButtonClass} px-6 h-12 md:h-10 sm:h-9 max-sm:h-8 rounded-md text-xl md:text-lg sm:text-base max-sm:text-sm font-bold transition-all flex items-center justify-center ${selectedBid !== null ? 'bg-gradient-to-br from-green-500 to-green-700 hover:from-green-600 hover:to-green-800 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
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