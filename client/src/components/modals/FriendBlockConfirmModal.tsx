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
          confirmColor: 'bg-green-600 hover:bg-green-700',
          icon: '👥'
        };
      case 'remove_friend':
        return {
          title: 'Remove Friend',
          message: `Are you sure you want to remove ${username} from your friends?`,
          confirmText: 'Remove Friend',
          confirmColor: 'bg-red-600 hover:bg-red-700',
          icon: '👥'
        };
      case 'block_user':
        return {
          title: 'Block User',
          message: `Are you sure you want to block ${username}? They will not be able to see you or send you messages.`,
          confirmText: 'Block User',
          confirmColor: 'bg-red-600 hover:bg-red-700',
          icon: '🚫'
        };
      case 'unblock_user':
        return {
          title: 'Unblock User',
          message: `Are you sure you want to unblock ${username}?`,
          confirmText: 'Unblock User',
          confirmColor: 'bg-green-600 hover:bg-green-700',
          icon: '🔓'
        };
      default:
        return {
          title: 'Confirm Action',
          message: 'Are you sure you want to proceed?',
          confirmText: 'Confirm',
          confirmColor: 'bg-blue-600 hover:bg-blue-700',
          icon: '❓'
        };
    }
  };

  const content = getModalContent();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
      <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
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
              className="px-4 py-2 bg-slate-600 text-white rounded hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={`px-4 py-2 text-white rounded transition-colors ${content.confirmColor}`}
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
