import React from 'react';

interface TableInactivityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TableInactivityModal: React.FC<TableInactivityModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-xl border border-white/10 bg-slate-950/95 p-6 shadow-lobby backdrop-blur-xl">
        <div className="text-center">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-slate-200 mb-4">
            Table Closed
          </h2>
          <p className="text-slate-300 mb-6">
            Your table was closed due to inactivity.
          </p>
          <button
            onClick={onClose}
            className="rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 px-6 py-2 font-semibold text-white shadow-md shadow-cyan-950/25 transition hover:from-cyan-400 hover:to-teal-500"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default TableInactivityModal; 