import { useState, useEffect } from 'react';
import { FaTrophy } from 'react-icons/fa';

interface WinnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  team1Score: number;
  team2Score: number;
  winningTeam: number;
  onPlayAgain?: () => void;
  userTeam?: number; // 1 for Blue Team, 2 for Red Team
  isCoinGame?: boolean; // Whether this is a coin game (4 human players)
  coinsWon?: number; // Number of coins won
  humanPlayerCount?: number; // Number of human players in the game
  onTimerExpire?: () => void; // Function to call when timer expires (should remove player from table)
  onLeaveTable?: () => void; // Function to call when leaving table
}

export default function WinnerModal({ 
  isOpen, 
  onClose, 
  team1Score, 
  team2Score, 
  winningTeam, 
  onPlayAgain, 
  userTeam,
  isCoinGame = false,
  coinsWon = 0,
  humanPlayerCount = 1,
  onTimerExpire,
  onLeaveTable
}: WinnerModalProps) {
  const [showPlayAgainPrompt, setShowPlayAgainPrompt] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(30);

  const handlePlayAgain = () => {
    setShowPlayAgainPrompt(true);
    onPlayAgain?.();
  };

  const handleLeave = () => {
    setShowPlayAgainPrompt(false);
    // Call the leave table function if provided, otherwise just close the modal
    if (onLeaveTable) {
      onLeaveTable();
    } else {
      onClose();
    }
  };

  // Timer effect for auto-leaving after 30 seconds
  useEffect(() => {
    if (!isOpen) {
      setTimeRemaining(30);
      setShowPlayAgainPrompt(false);
      return;
    }

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          console.log('[WINNER MODAL] Timer expired, auto-leaving');
          // Call the timer expire function if provided, otherwise fall back to onClose
          if (onTimerExpire) {
            onTimerExpire();
          } else {
            onClose();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, onClose, onTimerExpire]);

  // Determine if user won
  const userWon = userTeam === winningTeam;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="w-[380px] md:w-[360px] sm:w-[320px] max-sm:w-[280px] backdrop-blur-md bg-gray-900/75 border border-white/20 rounded-2xl p-4 max-sm:p-3 shadow-xl">
        <div className="flex items-center justify-center gap-2 mb-3">
          <FaTrophy className="h-6 w-6 text-yellow-500" />
          <h2 className="text-lg font-bold text-white text-center">
            {userWon ? 'YOU WIN!' : 'YOU LOSE!'}
            {isCoinGame && userWon && (
              <span className="block text-sm text-yellow-400 mt-1">
                +{coinsWon.toLocaleString()} coins
              </span>
            )}
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Team 1 (Red) */}
          <div className="bg-gray-800/50 backdrop-blur rounded-lg p-2 border border-white/5">
            <div className="flex items-center mb-1">
              <div className="bg-red-500 rounded-full w-2 h-2 mr-1"></div>
              <h3 className="text-base font-semibold text-white">Red Team</h3>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Final Score</span>
                <span className="font-medium text-white">{team1Score}</span>
              </div>
            </div>
          </div>

          {/* Team 2 (Blue) */}
          <div className="bg-gray-800/50 backdrop-blur rounded-lg p-2 border border-white/5">
            <div className="flex items-center mb-1">
              <div className="bg-blue-500 rounded-full w-2 h-2 mr-1"></div>
              <h3 className="text-base font-semibold text-white">Blue Team</h3>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Final Score</span>
                <span className="font-medium text-white">{team2Score}</span>
              </div>
            </div>
          </div>
        </div>

        {!showPlayAgainPrompt ? (
          <div className="mt-4 flex flex-col gap-2">
            <button
              onClick={handlePlayAgain}
              className="w-full px-4 py-1.5 text-sm bg-gradient-to-r from-blue-600 to-blue-800 text-white font-medium rounded shadow hover:from-blue-700 hover:to-blue-900 transition-all"
            >
              Play Again ({timeRemaining}s)
            </button>
            <button
              onClick={handleLeave}
              className="w-full px-4 py-1.5 text-sm bg-gradient-to-r from-gray-600 to-gray-800 text-white font-medium rounded shadow hover:from-gray-700 hover:to-gray-900 transition-all"
            >
              Leave Table
            </button>
          </div>
        ) : (
          <div className="mt-4 text-center">
            {humanPlayerCount > 1 ? (
              <>
                <p className="text-sm font-medium text-white">Waiting for other players...</p>
                <p className="text-xs text-gray-400 mt-1">You can leave the table if you don't want to wait</p>
              </>
            ) : (
              <p className="text-sm font-medium text-white">Starting new game...</p>
            )}
            <button
              onClick={handleLeave}
              className="mt-3 w-full px-4 py-1.5 text-sm bg-gradient-to-r from-gray-600 to-gray-800 text-white font-medium rounded shadow hover:from-gray-700 hover:to-gray-900 transition-all"
            >
              Leave Table
            </button>
          </div>
        )}
      </div>
    </div>
  );
} 