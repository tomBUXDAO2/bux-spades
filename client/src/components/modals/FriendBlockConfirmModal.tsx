import React from 'react';

interface FriendBlockConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  action: 'add_friend' | 'remove_friend' | 'block_user' | 'unblock_user';
  username: string;
}

const FriendBlockConfirmModal: React.FC<FriendBlockConfirmModalProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  action, 
  username 
}) => {
  if (!isOpen) return null;

  const getModalContent = () => {
    switch (action) {
      case 'add_friend':
        return {
          title: 'Add Friend',
          message: `Are you sure you want to add ${username} as a friend?`,
          confirmText: 'Add Friend',
          confirmClass: 'rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-4 py-2 font-semibold text-emerald-100 transition hover:bg-emerald-900/60',
          icon: '👥'
        };
      case 'remove_friend':
        return {
          title: 'Remove Friend',
          message: `Are you sure you want to remove ${username} from your friends?`,
          confirmText: 'Remove Friend',
          confirmClass: 'rounded-lg border border-red-500/40 bg-red-950/50 px-4 py-2 font-semibold text-red-100 transition hover:bg-red-900/60',
          icon: '👥'
        };
      case 'block_user':
        return {
          title: 'Block User',
          message: `Are you sure you want to block ${username}? They will not be able to see you or send you messages.`,
          confirmText: 'Block User',
          confirmClass: 'rounded-lg border border-red-500/40 bg-red-950/50 px-4 py-2 font-semibold text-red-100 transition hover:bg-red-900/60',
          icon: '🚫'
        };
      case 'unblock_user':
        return {
          title: 'Unblock User',
          message: `Are you sure you want to unblock ${username}?`,
          confirmText: 'Unblock User',
          confirmClass: 'rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-4 py-2 font-semibold text-emerald-100 transition hover:bg-emerald-900/60',
          icon: '🔓'
        };
      default:
        return {
          title: 'Confirm Action',
          message: 'Are you sure you want to proceed?',
          confirmText: 'Confirm',
          confirmClass: 'rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 px-4 py-2 font-semibold text-white shadow-md shadow-cyan-950/25 transition hover:from-cyan-400 hover:to-teal-500',
          icon: '❓'
        };
    }
  };

  const content = getModalContent();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-xl border border-white/10 bg-slate-950/95 p-6 shadow-lobby backdrop-blur-xl">
        <div className="text-center">
          <div className="text-4xl mb-4">{content.icon}</div>
          <h2 className="text-xl font-bold text-slate-200 mb-4">
            {content.title}
          </h2>
          <p className="text-slate-300 mb-6">
            {content.message}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={onClose}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-slate-200 transition hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={content.confirmClass}
            >
              {content.confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FriendBlockConfirmModal;
