import React from 'react';

interface NewUserWelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const NewUserWelcomeModal: React.FC<NewUserWelcomeModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md animate-fade-in rounded-xl border border-white/10 bg-slate-950/95 p-8 shadow-lobby backdrop-blur-xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-slate-200 mb-4">Welcome to BUX Spades! 🎉</h2>
          
          <div className="space-y-4 text-slate-300">
            <p className="text-xl">
              You've received
              <span className="text-yellow-500 font-bold"> 5,000,000 </span>
              coins to start your journey!
            </p>
            
            <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-4 text-left backdrop-blur-sm">
              <h3 className="font-semibold text-slate-200">Quick Tips:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Create or join a game in the lobby</li>
                <li>Play with friends or make new ones</li>
                <li>Track your progress on the leaderboard</li>
                <li>Have fun and good luck!</li>
              </ul>
            </div>
          </div>

          <div className="mt-8">
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 py-3 px-6 font-semibold text-white shadow-md shadow-cyan-950/25 transition hover:from-cyan-400 hover:to-teal-500"
            >
              Let's Play!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewUserWelcomeModal; 