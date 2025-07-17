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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="text-center">
          {/* Warning Icon */}
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 mb-4">
            <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          {/* Title */}
          <h3 className="text-lg font-medium text-white mb-2">
            Empty Seats Detected
          </h3>

          {/* Message */}
          <p className="text-gray-300 mb-2">
            Coin games require 4 human players. You have {emptySeatsCount} empty seat{emptySeatsCount !== 1 ? 's' : ''}.
          </p>
          <p className="text-gray-300 mb-6">
            If you continue, the game will start with bot players in all empty seats and the game will not be rated.
          </p>

          {/* Buttons */}
          <div className="flex gap-3 justify-center">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onPlayWithBots}
              className="px-4 py-2 bg-yellow-500 text-black font-semibold rounded-lg hover:bg-yellow-600 transition-colors"
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