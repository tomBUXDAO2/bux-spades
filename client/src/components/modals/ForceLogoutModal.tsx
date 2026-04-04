import React from 'react';
import { Dialog } from '@headlessui/react';

interface ForceLogoutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ForceLogoutModal: React.FC<ForceLogoutModalProps> = ({ isOpen, onClose }) => {
  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-w-md rounded-2xl border border-white/10 bg-slate-950/95 p-6 shadow-lobby backdrop-blur-xl">
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
              className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 py-3 px-4 font-semibold text-white shadow-md shadow-cyan-950/25 transition hover:from-cyan-400 hover:to-teal-500"
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

