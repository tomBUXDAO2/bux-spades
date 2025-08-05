import React from 'react';

interface SessionInvalidatedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
}

const SessionInvalidatedModal: React.FC<SessionInvalidatedModalProps> = ({ isOpen, onClose, onLogin }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
      <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
        <div className="text-center">
          <div className="text-orange-500 text-4xl mb-4">🔐</div>
          <h2 className="text-xl font-bold text-slate-200 mb-4">
            Session Invalidated
          </h2>
          <p className="text-slate-300 mb-6">
            You have logged in to your account on another device and have been logged out here.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700 transition-colors"
            >
              Close
            </button>
            <button
              onClick={onLogin}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
            >
              Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionInvalidatedModal; 