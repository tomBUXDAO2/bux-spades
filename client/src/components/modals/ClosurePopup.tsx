import React from 'react';

interface ClosurePopupProps {
  message: string;
  onClose: () => void;
}

const ClosurePopup: React.FC<ClosurePopupProps> = ({ message, onClose }) => {
  if (!message) return null;
  
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-xl border border-white/10 bg-slate-950/95 p-6 text-center shadow-lobby backdrop-blur-xl">
        <h3 className="mb-3 text-xl font-bold text-white">Table Closed</h3>
        <p className="mb-6 text-slate-300">{message}</p>
        <button
          onClick={onClose}
          className="rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 px-4 py-2 font-semibold text-white shadow-md shadow-cyan-950/25 transition hover:from-cyan-400 hover:to-teal-500"
        >
          OK
        </button>
      </div>
    </div>
  );
};

export default ClosurePopup;
