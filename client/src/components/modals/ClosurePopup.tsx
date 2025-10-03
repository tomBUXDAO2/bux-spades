import React from 'react';

interface ClosurePopupProps {
  message: string;
  onClose: () => void;
}

const ClosurePopup: React.FC<ClosurePopupProps> = ({ message, onClose }) => {
  if (!message) return null;
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000]">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl border border-white/20 text-center">
        <h3 className="text-xl font-bold text-white mb-3">Table Closed</h3>
        <p className="text-gray-200 mb-6">{message}</p>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          OK
        </button>
      </div>
    </div>
  );
};

export default ClosurePopup;
