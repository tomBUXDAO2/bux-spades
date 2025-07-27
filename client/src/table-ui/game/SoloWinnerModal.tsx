import { useState, useEffect } from 'react';
import { FaTrophy } from 'react-icons/fa';
import { getPlayerColor } from '../lib/gameRules';

interface SoloWinnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerScores: number[];
  winningPlayer: number;
  onPlayAgain?: () => void;
  userPlayerIndex?: number; // The current user's player index
}

export default function SoloWinnerModal({ 
  isOpen, 
  onClose, 
  playerScores, 
  winningPlayer, 
  onPlayAgain, 
  userPlayerIndex 
}: SoloWinnerModalProps) {
  const [showPlayAgainPrompt, setShowPlayAgainPrompt] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(30);

  const handlePlayAgain = () => {
    setShowPlayAgainPrompt(true);
    onPlayAgain?.();
  };

  const handleLeave = () => {
    setShowPlayAgainPrompt(false);
    onClose();
  };

  // Timer effect for auto-leaving after 30 seconds
  useEffect(() => {
    if (!isOpen) {
      setTimeRemaining(30);
      return;
    }

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          console.log('[SOLO WINNER MODAL] Timer expired, auto-leaving');
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, onClose]);

  // Sort players by score in descending order
  const sortedPlayers = playerScores
    .map((score, index) => ({ score, index }))
    .sort((a, b) => b.score - a.score);

  // Find user's placement
  const userPlacement = sortedPlayers.findIndex(player => player.index === userPlayerIndex) + 1;
  
  // Get placement text
  const getPlacementText = (placement: number) => {
    switch (placement) {
      case 1: return '1st PLACE';
      case 2: return '2nd PLACE';
      case 3: return '3rd PLACE';
      case 4: return '4th PLACE';
      default: return `${placement}th PLACE`;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-900/75 rounded-lg p-3 max-w-md w-full shadow-xl border border-white/20">
        <div className="flex items-center justify-center gap-2 mb-3">
          <FaTrophy className="h-6 w-6 text-yellow-500" />
          <h2 className="text-lg font-bold text-white text-center">{getPlacementText(userPlacement)}</h2>
        </div>

        <div className="space-y-3 mb-4">
          {sortedPlayers.map((player, sortedIndex) => {
            const { score, index } = player;
            const playerColor = getPlayerColor(index);
            const isWinner = index === winningPlayer;
            const isUser = index === userPlayerIndex;
            const placement = sortedIndex + 1;
            
            return (
              <div key={index} className={`bg-gray-800/50 backdrop-blur rounded-lg p-2 border ${isWinner ? 'border-yellow-500' : 'border-white/5'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className={`${playerColor.bg} rounded-full w-2 h-2 mr-2`}></div>
                    <span className={`text-sm font-medium ${isUser ? 'text-white' : 'text-gray-300'}`}>
                      {getPlacementText(placement)} - {playerColor.name} Player {isUser ? '(You)' : ''}
                    </span>
                    {isWinner && <FaTrophy className="h-4 w-4 text-yellow-500 ml-2" />}
                  </div>
                  <span className={`font-bold text-sm ${isWinner ? 'text-yellow-400' : 'text-white'}`}>
                    {score}
                  </span>
                </div>
              </div>
            );
          })}
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
            <p className="text-sm font-medium text-white">Waiting for other players...</p>
            <p className="text-xs text-gray-400 mt-1">You can leave the table if you don't want to wait</p>
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