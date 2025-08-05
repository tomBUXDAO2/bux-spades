import React from 'react';

interface TableInactivityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TableInactivityModal: React.FC<TableInactivityModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
      <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
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
            className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default TableInactivityModal; 