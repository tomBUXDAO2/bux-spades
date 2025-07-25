import React from 'react';

interface NewUserWelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const NewUserWelcomeModal: React.FC<NewUserWelcomeModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg p-8 max-w-md w-full mx-4 animate-fade-in border border-white/20">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-slate-200 mb-4">Welcome to BUX Spades! 🎉</h2>
          
          <div className="space-y-4 text-slate-300">
            <p className="text-xl">
              You've received
              <span className="text-yellow-500 font-bold"> 5,000,000 </span>
              coins to start your journey!
            </p>
            
            <div className="bg-slate-700 p-4 rounded-lg text-left space-y-2">
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
              className="w-full bg-indigo-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-indigo-700 transition"
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