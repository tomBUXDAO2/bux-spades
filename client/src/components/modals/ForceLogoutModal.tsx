import React from 'react';
import { Dialog } from '@headlessui/react';

interface ForceLogoutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ForceLogoutModal: React.FC<ForceLogoutModalProps> = ({ isOpen, onClose }) => {
  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-w-md rounded-2xl bg-slate-800 p-6 shadow-xl border border-white/20">
          <Dialog.Title className="text-xl font-bold text-white mb-4 text-center">
            Logged Out
          </Dialog.Title>
          
          <div className="space-y-4">
            <p className="text-slate-300 text-center">
              You have been logged out because you logged in from another device.
            </p>
            
            <p className="text-slate-400 text-sm text-center">
              You can only be logged in on one device at a time.
            </p>
          </div>
          
          <div className="mt-6">
            <button
              onClick={onClose}
              className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-indigo-700 transition"
            >
              OK
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
};

export default ForceLogoutModal;

