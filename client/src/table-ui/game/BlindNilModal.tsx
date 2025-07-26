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
      <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
        <h2 className="text-xl font-bold text-center mb-6">Bid blind nil?</h2>
        
        <div className="flex gap-4 justify-center">
          <button
            onClick={onBlindNil}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Yes
          </button>
          <button
            onClick={onRegularBid}
            className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
};

export default BlindNilModal; 