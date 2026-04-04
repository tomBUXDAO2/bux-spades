import React from 'react';

interface BlindNilModalProps {
  isOpen: boolean;
  onBlindNil: () => void;
  onRegularBid: () => void;
}

const BlindNilModal: React.FC<BlindNilModalProps> = ({ isOpen, onBlindNil, onRegularBid }) => {
  if (!isOpen) return null;

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999]">
      <div className="w-[380px] max-sm:w-[280px] sm:w-[320px] md:w-[360px] rounded-2xl border border-white/10 bg-slate-950/95 p-4 shadow-lobby backdrop-blur-xl max-sm:p-3">
        <div className="text-center mb-3 max-sm:mb-2">
          <h2 className="text-lg max-sm:text-base font-bold text-white">Bid blind nil?</h2>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              console.log('[BLIND NIL MODAL] Yes button clicked');
              onBlindNil();
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="flex-1 cursor-pointer rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 py-3 px-4 font-bold text-white shadow-md shadow-cyan-950/25 transition hover:from-cyan-400 hover:to-teal-500"
            style={{ pointerEvents: 'auto' }}
          >
            Yes
          </button>
          <button
            onClick={() => {
              console.log('[BLIND NIL MODAL] No button clicked');
              onRegularBid();
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="flex-1 cursor-pointer rounded-lg border border-white/10 bg-white/5 py-3 px-4 font-bold text-slate-200 transition hover:bg-white/10"
            style={{ pointerEvents: 'auto' }}
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
};

export default BlindNilModal; 