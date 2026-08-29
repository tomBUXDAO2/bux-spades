import React, { useEffect } from 'react';

/** Shown in the browser tab after Android PWA OAuth — the installed app claims the session. */
const ReturnToApp: React.FC = () => {
  useEffect(() => {
    try {
      localStorage.removeItem('sessionToken');
      localStorage.removeItem('userData');
      localStorage.removeItem('activeGameId');
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-6">
      <div className="max-w-md text-center">
        <h2 className="text-2xl font-semibold text-slate-100">Facebook login complete</h2>
        <p className="mt-3 text-slate-300 leading-relaxed">
          Switch back to <strong className="text-white">BUX Spades</strong> (the app you left open —
          use the app switcher or home-screen icon). It should sign you in within a couple of seconds.
        </p>
        <p className="mt-4 text-sm text-slate-500">You can close this browser tab after you are in the app.</p>
      </div>
    </div>
  );
};

export default ReturnToApp;
