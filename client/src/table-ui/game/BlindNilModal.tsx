import React from 'react';

interface BlindNilModalProps {
  isOpen: boolean;
  onBlindNil: () => void;
  onRegularBid: () => void;
}

const BlindNilModal: React.FC<BlindNilModalProps> = ({ isOpen, onBlindNil, onRegularBid }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md flex flex-col items-center justify-center border border-white/20">
        <h2 className="text-2xl font-bold text-white mb-4 text-center">Bid blind nil?</h2>
        <div className="flex gap-4 w-full justify-center">
          <button
            onClick={onBlindNil}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
          >
            Yes
          </button>
          <button
            onClick={onRegularBid}
            className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
};

export default BlindNilModal; 