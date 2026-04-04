import React from 'react';
import LoginPanel from './LoginPanel';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-xl max-w-md w-full p-6 sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <LoginPanel variant="modal" onClose={onClose} />
      </div>
    </div>
  );
};

export default LoginModal;
