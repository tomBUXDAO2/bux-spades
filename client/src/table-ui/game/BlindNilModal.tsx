import React from 'react';

interface BlindNilModalProps {
  isOpen: boolean;
  onBlindNil: () => void;
  onRegularBid: () => void;
}

const BlindNilModal: React.FC<BlindNilModalProps> = ({ isOpen, onBlindNil, onRegularBid }) => {
  if (!isOpen) return null;

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
      <div className="w-[380px] md:w-[360px] sm:w-[320px] max-sm:w-[280px] backdrop-blur-md bg-gray-900/75 border border-white/20 rounded-2xl p-4 max-sm:p-3 shadow-xl">
        <div className="text-center mb-3 max-sm:mb-2">
          <h2 className="text-lg max-sm:text-base font-bold text-white">Bid blind nil?</h2>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onBlindNil}
            className="flex-1 bg-gradient-to-br from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 text-white font-bold py-3 px-4 rounded-lg transition-all shadow-lg"
          >
            Yes
          </button>
          <button
            onClick={onRegularBid}
            className="flex-1 bg-gradient-to-br from-gray-600 to-gray-800 hover:from-gray-700 hover:to-gray-900 text-white font-bold py-3 px-4 rounded-lg transition-all shadow-lg"
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
};

export default BlindNilModal; 