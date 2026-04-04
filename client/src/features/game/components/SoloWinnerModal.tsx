import { useState, useEffect } from 'react';
import { FaTrophy } from 'react-icons/fa';
import { getPlayerColor } from '@/features/game/services/lib/gameRules';
import type { Player, Bot } from '@/types/game';
import { abbreviateBotName } from '../../../utils/botUtils';
import { playCheeringSound } from '../../../services/utils/soundUtils';

interface SoloWinnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerScores: number[];
  winningPlayer: number;
  onPlayAgain?: () => void;
  userPlayerIndex?: number; // The current user's player index
  humanPlayerCount?: number; // Number of human players in the game
  onTimerExpire?: () => void; // Function to call when timer expires (should remove player from table)
  buyIn?: number; // Buy-in amount for coin calculation
  onLeaveTable?: () => void; // Function to call when leaving table
  players?: (Player | Bot | null)[]; // Players to display names/avatars
  isRated?: boolean; // Whether this was a rated game (all 4 humans)
}

export default function SoloWinnerModal({ 
  isOpen, 
  onClose, 
  playerScores, 
  winningPlayer, 
  onPlayAgain, 
  userPlayerIndex,
  humanPlayerCount = 1,
  onTimerExpire,
  buyIn = 0,
  onLeaveTable,
  players = [],
  isRated = false
}: SoloWinnerModalProps) {
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
      return;
    }

    // Play cheering sound when solo winner modal opens
    if (isOpen) {
      playCheeringSound();
    }

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          console.log('[SOLO WINNER MODAL] Timer expired, auto-leaving');
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
  
  // Calculate coin prizes for solo mode (only if rated)
  const calculateCoinPrizes = () => {
    if (!isRated || !buyIn || buyIn <= 0) return { firstPlace: 0, secondPlace: 0 };
    
    const totalPot = buyIn * 4;
    const rake = Math.floor(totalPot * 0.1); // 10% rake
    const prizePool = totalPot - rake; // Available for future use
    console.log("Solo game prize pool:", prizePool);
    
    // Solo mode: 1st place gets 2.6x buy-in, 2nd place gets buy-in back
    // Note: These are fixed amounts, not based on prizePool    
    
    // Solo mode: 1st place gets 2.6x buy-in, 2nd place gets buy-in back
    const firstPlacePrize = Math.floor(buyIn * 2.6); // 1st place gets 2.6x buy-in
    const secondPlacePrize = buyIn; // 2nd place gets buy-in back
    
    return { firstPlace: firstPlacePrize, secondPlace: secondPlacePrize };
  };
  
  const coinPrizes = calculateCoinPrizes();
  
  // Format coins helper
  const formatCoins = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`;
    }
    return value.toString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-2 backdrop-blur-sm sm:p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950/95 p-3 shadow-lobby backdrop-blur-xl sm:max-w-lg sm:p-4">
        <div className="flex items-center justify-center gap-2 mb-3">
          <FaTrophy className="h-6 w-6 text-yellow-500" />
          <h2 className="text-lg font-bold text-white text-center">{getPlacementText(userPlacement)}</h2>
        </div>

        <div className="space-y-2 mb-4">
          {sortedPlayers.map((player, sortedIndex) => {
            const { score, index } = player;
            const playerColor = getPlayerColor(index);
            const isWinner = index === winningPlayer;
            const placement = sortedIndex + 1;

            const p = players[index] as (Player | Bot | null);
            let displayName = (p && ('username' in p) && p.username) ? p.username : 'Unknown';
            
            // Abbreviate bot names
            if (p && 'type' in p && p.type === 'bot') {
              displayName = abbreviateBotName(displayName);
            }
            
            const avatarUrl = (p && ('avatar' in p) && p.avatar) ? p.avatar! : '/default-pfp.jpg';
            
            return (
              <div key={index} className={`rounded-lg border bg-slate-900/50 p-2 backdrop-blur-sm ${isWinner ? 'border-amber-400/60' : 'border-white/10'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center min-w-0 flex-1">
                    <div className={`${playerColor.bg} rounded-full w-2 h-2 mr-2 flex-shrink-0`}></div>
                    <img src={avatarUrl} alt={displayName} className="w-5 h-5 rounded-full mr-2 object-cover flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white truncate">{displayName}</div>
                      <div className="text-xs text-slate-400">{getPlacementText(placement)}</div>
                    </div>
                    {isWinner && <FaTrophy className="h-4 w-4 text-yellow-500 ml-2 flex-shrink-0" />}
                  </div>
                  <div className="flex flex-col items-end ml-2">
                    <span className={`font-bold text-sm ${isWinner ? 'text-yellow-400' : 'text-white'}`}>
                      {score}
                    </span>
                    {isRated && buyIn > 0 && (
                      <span className={`text-xs ${placement === 1 ? 'text-yellow-400' : placement === 2 ? 'text-green-400' : 'text-slate-400'}`}>
                        {placement === 1 ? `+${formatCoins(coinPrizes.firstPlace)}` : 
                         placement === 2 ? `+${formatCoins(coinPrizes.secondPlace)}` : 
                         '0k'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {!showPlayAgainPrompt ? (
          <div className="mt-4 flex flex-col gap-2">
            <button
              onClick={handlePlayAgain}
              className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-cyan-950/25 transition hover:from-cyan-400 hover:to-teal-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              Play Again ({timeRemaining}s)
            </button>
            <button
              onClick={handleLeave}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 shadow-sm transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              Leave Table
            </button>
          </div>
        ) : (
          <div className="mt-4 text-center">
            {humanPlayerCount > 1 ? (
              <>
                <p className="text-sm font-medium text-white">Waiting for other players...</p>
                <p className="mt-1 text-xs text-slate-400">You can leave the table if you don't want to wait</p>
              </>
            ) : (
              <p className="text-sm font-medium text-white">Starting new game...</p>
            )}
            <button
              onClick={handleLeave}
              className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 shadow-sm transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              Leave Table
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
