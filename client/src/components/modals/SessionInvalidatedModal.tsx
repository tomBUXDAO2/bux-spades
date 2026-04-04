import React from 'react';

interface SessionInvalidatedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
}

const SessionInvalidatedModal: React.FC<SessionInvalidatedModalProps> = ({ isOpen, onClose, onLogin }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-xl border border-white/10 bg-slate-950/95 p-6 shadow-lobby backdrop-blur-xl">
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
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-slate-200 transition hover:bg-white/10"
            >
              Close
            </button>
            <button
              onClick={onLogin}
              className="rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 px-4 py-2 font-semibold text-white shadow-md shadow-cyan-950/25 transition hover:from-cyan-400 hover:to-teal-500"
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