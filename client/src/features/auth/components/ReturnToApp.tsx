import React from 'react';

/** Shown in the browser tab after PWA OAuth completes — login is claimed by the installed app. */
const ReturnToApp: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-900 px-6">
    <div className="max-w-md text-center">
      <h2 className="text-2xl font-semibold text-slate-100">Facebook login complete</h2>
      <p className="mt-3 text-slate-300 leading-relaxed">
        Switch back to the <strong className="text-white">BUX Spades</strong> icon on your home
        screen. The app will finish signing you in automatically — you do not need to tap Facebook
        again.
      </p>
      <p className="mt-4 text-sm text-slate-500">You can close this browser tab.</p>
    </div>
  </div>
);

export default ReturnToApp;
