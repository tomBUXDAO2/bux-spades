import React from 'react';

interface BlindNilModalProps {
  isOpen: boolean;
  onBlindNil: () => void;
  onRegularBid: () => void;
}

export default function BlindNilModal({ isOpen, onBlindNil, onRegularBid }: BlindNilModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md flex flex-col items-center justify-center border border-white/20">
        <h2 className="text-2xl font-bold text-white mb-4 text-center">Blind Nil?</h2>
        <p className="text-slate-300 text-center mb-6">
          Would you like to bid blind nil? You won't see your cards and must win 0 tricks for 200 points (or lose 200 if you win any).
        </p>
        <div className="flex gap-4 w-full">
          <button
            onClick={onBlindNil}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
          >
            Blind Nil
          </button>
          <button
            onClick={onRegularBid}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
          >
            Regular Bid
          </button>
        </div>
      </div>
    </div>
  );
} 