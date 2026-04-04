import React from 'react';

interface StartGameWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayWithBots: () => void;
  emptySeatsCount: number;
}

const StartGameWarningModal: React.FC<StartGameWarningModalProps> = ({
  isOpen,
  onClose,
  onPlayWithBots,
  emptySeatsCount
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed sm:absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
      <div className="mx-4 w-full max-w-md rounded-xl border border-white/10 bg-slate-950/95 p-6 shadow-lobby backdrop-blur-xl">
        <div>
          {/* Header with inline icon and title */}
          <div className="flex items-center justify-center mb-4">
            <svg className="mr-2 h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-2xl font-bold text-white">
              Empty Seats Detected
            </h3>
          </div>
          {/* Message - center aligned */}
          <div className="text-center mb-6">
            <p className="mb-2 text-lg font-semibold text-slate-200">
              Coin games require 4 human players.<br />You have {emptySeatsCount} empty seat{emptySeatsCount !== 1 ? 's' : ''}.
            </p>
            <p className="text-slate-400">
              If you continue, the game will start with bot players in all empty seats and the game will not be rated.
            </p>
          </div>
          {/* Buttons */}
          <div className="flex gap-3 justify-center">
            <button
              onClick={onClose}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-slate-200 transition hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              onClick={onPlayWithBots}
              className="rounded-lg bg-gradient-to-r from-amber-400 to-amber-600 px-4 py-2 font-semibold text-slate-900 shadow-md shadow-amber-950/30 transition hover:from-amber-300 hover:to-amber-500"
            >
              Play with Bots
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StartGameWarningModal; 