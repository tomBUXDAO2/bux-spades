import React from 'react';
import { Dialog } from '@headlessui/react';

interface EnableNotificationsModalProps {
  isOpen: boolean;
  kind: 'ask' | 'blocked';
  onEnable: () => void;
  onDismiss: () => void;
}

const EnableNotificationsModal: React.FC<EnableNotificationsModalProps> = ({
  isOpen,
  kind,
  onEnable,
  onDismiss,
}) => {
  const blocked = kind === 'blocked';

  return (
    <Dialog open={isOpen} onClose={onDismiss} className="relative z-50">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-w-md rounded-2xl border border-white/10 bg-slate-950/95 p-6 shadow-lobby backdrop-blur-xl">
          <Dialog.Title className="text-xl font-bold text-white mb-4 text-center">
            {blocked ? 'Notifications blocked' : 'Turn on notifications'}
          </Dialog.Title>

          <p className="text-slate-300 text-center text-sm leading-relaxed">
            {blocked
              ? 'This browser blocked notifications (often without showing a prompt). Unblock them, then tap Allow again.'
              : 'Get alerts for chat, league news, and your turn when the app is closed.'}
          </p>

          {blocked && (
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-slate-400">
              <li>Chrome menu → Settings → Site settings → Notifications</li>
              <li>Find bux-spades.pro and set it to Allow</li>
              <li>Reopen the app and tap Allow below</li>
            </ol>
          )}

          <div className="mt-6 space-y-2">
            <button
              type="button"
              onClick={onEnable}
              className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 py-3 px-4 font-semibold text-white shadow-md shadow-cyan-950/25 transition hover:from-cyan-400 hover:to-teal-500"
            >
              {blocked ? 'Try again' : 'Allow notifications'}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="w-full rounded-lg py-2 px-4 text-sm font-medium text-slate-400 hover:text-white"
            >
              Not now
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
};

export default EnableNotificationsModal;
