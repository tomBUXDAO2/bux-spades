import { useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { isGameOver } from '@/features/game/services/lib/gameRules';
import type { GameState } from '../../types/game';
import { useEffect } from 'react';
import { abbreviateBotName } from '../../../utils/botUtils';

interface HandSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameState: GameState;
  onNextHand: () => void;
  handSummaryData?: {
    team1Score: number;
    team2Score: number;
    team1Bags: number;
    team2Bags: number;
    team1TotalScore: number;
    team2TotalScore: number;
    tricksPerPlayer: number[];
    playerScores?: number[];
    playerBags?: number[];
  };
}

export default function HandSummaryModal({
  isOpen,
  
  gameState,
  onNextHand,
  handSummaryData
}: HandSummaryModalProps) {
  const [timeRemaining, setTimeRemaining] = useState(12);
  
  // Scores come from backend - no calculation needed
  const team1TotalScore = gameState?.team1TotalScore || 0;
  const team2TotalScore = gameState?.team2TotalScore || 0;

  // Game completion is handled by backend - no frontend check needed

  // Require handSummaryData to be present - no fallback calculations
  if (!handSummaryData) {
    return null;
  }

  // Timer effect
  useEffect(() => {
    if (!isOpen) {
      setTimeRemaining(12);
      return;
    }

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          onNextHand();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  // Get player name helper
  const getPlayerName = (index: number) => {
    const player = gameState.players[index];
    if (!player) return 'Empty';
    const username = player.username || 'Unknown';
    // Abbreviate bot names
    return player.type === 'bot' ? abbreviateBotName(username) : username;
  };

  // Get player avatar helper
  const getPlayerAvatar = (index: number) => {
    const player = gameState.players[index];
    if (!player) return '/default-pfp.jpg';
    // Check for avatarUrl property (from database) or avatar property
    return player.avatarUrl || player.avatar || '/default-pfp.jpg';
  };

  // Team data comes from backend - no calculation needed
  const tricksPerPlayer = handSummaryData?.tricksPerPlayer || [0, 0, 0, 0];
  
  // Team 1 (Red) - seats 0, 2
  const team1Bid = handSummaryData?.team1Bid || 0;
  const team1Tricks = handSummaryData?.team1Tricks || 0;
  const team1NilPoints = handSummaryData?.team1NilPoints || 0;
  const team1Bags = handSummaryData?.team1Bags || 0;
  const team1Score = handSummaryData?.team1Score || 0;
  
  // Team 2 (Blue) - seats 1, 3  
  const team2Bid = handSummaryData?.team2Bid || 0;
  const team2Tricks = handSummaryData?.team2Tricks || 0;
  const team2NilPoints = handSummaryData?.team2NilPoints || 0;
  const team2Bags = handSummaryData?.team2Bags || 0;
  const team2Score = handSummaryData?.team2Score || 0;

  if (!isOpen) return null;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={() => {}}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-2 sm:p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md sm:max-w-lg backdrop-blur-md bg-gray-900/75 border border-white/20 rounded-2xl p-3 sm:p-4 shadow-xl">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <h2 className="text-lg font-bold text-white text-center">Hand Summary</h2>
                </div>

                {gameState.gameMode === 'SOLO' ? (
                  // Solo mode - individual player scores
                  <div className="space-y-3">
                    {gameState.players.map((player, index) => {
                      if (!player) return null;
                      const bid = gameState.bidding?.bids?.[index] || 0;
                      const tricks = tricksPerPlayer[index] || 0;
                      const handTotal = tricks - bid;
                      const totalScore = handSummaryData.playerScores?.[index] || gameState.playerScores?.[index] || 0;
                      
                      return (
                        <div key={index} className="bg-gray-800/50 backdrop-blur rounded-lg p-3 border border-white/5">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <img 
                                src={getPlayerAvatar(index)} 
                                alt={getPlayerName(index)} 
                                className="w-6 h-6 rounded-full object-cover" 
                              />
                              <span className="text-white font-semibold text-sm">{getPlayerName(index)}</span>
                            </div>
                            <div className="text-right">
                              <div className="text-white text-xs">Bid: {bid} | Made: {tricks}</div>
                              <div className={`text-sm font-bold ${handTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {handTotal}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-gray-400 text-xs">Total Score</div>
                            <div className="text-white font-bold">{totalScore}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  // Partners mode - side-by-side layout for mobile
                  <div className="grid grid-cols-2 gap-3">
                    {/* Red Team */}
                    <div className="bg-gray-800/50 backdrop-blur rounded-lg p-2 border border-white/5">
                      <div className="flex items-center mb-2">
                        <div className="bg-red-500 rounded-full w-2 h-2 mr-2"></div>
                        <h3 className="text-sm font-semibold text-white">Red Team</h3>
                      </div>
                      <div className="space-y-1">
                        {/* Made/Bid */}
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">Made/Bid:</span>
                          <span className="text-white">({team1Tricks}/{team1Bid}) {team1Tricks >= team1Bid ? team1Bid * 10 : -(team1Bid * 10)}</span>
                        </div>
                        
                        {/* Nils - always show */}
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">Nils:</span>
                          <span className={`font-medium ${team1NilPoints >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team1NilPoints === 0 ? '0' : team1NilPoints}
                          </span>
                        </div>
                        
                        {/* Bags - always show */}
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">Bags:</span>
                          <span className={`font-medium ${team1Bags === 0 ? 'text-gray-400' : 'text-yellow-400'}`}>
                            {team1Bags === 0 ? '0' : team1Bags}
                          </span>
                        </div>
                        
                        {/* Round Score */}
                        <div className="flex justify-between text-xs border-t border-white/10 pt-1">
                          <span className="text-gray-400">Round Score:</span>
                          <span className={`font-bold ${team1Score >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team1Score}
                          </span>
                        </div>
                        
                        {/* Total Score */}
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">Total Score</span>
                          <span className="font-medium text-white">{team1TotalScore}</span>
                        </div>
                        
                        <div className="space-y-1 mt-2">
                          {[0, 2].map((idx) => {
                            const player = gameState.players[idx];
                            if (!player) return null;
                            return (
                              <div key={`team1-${idx}`} className="flex items-center text-xs text-white/90">
                                <div className="bg-red-500 rounded-full w-1.5 h-1.5 mr-2"></div>
                                <img src={getPlayerAvatar(idx)} alt={getPlayerName(idx)} className="w-4 h-4 rounded-full mr-2 object-cover" />
                                <span className="truncate">{getPlayerName(idx)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Blue Team */}
                    <div className="bg-gray-800/50 backdrop-blur rounded-lg p-2 border border-white/5">
                      <div className="flex items-center mb-2">
                        <div className="bg-blue-500 rounded-full w-2 h-2 mr-2"></div>
                        <h3 className="text-sm font-semibold text-white">Blue Team</h3>
                      </div>
                      <div className="space-y-1">
                        {/* Made/Bid */}
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">Made/Bid:</span>
                          <span className="text-white">({team2Tricks}/{team2Bid}) {team2Tricks >= team2Bid ? team2Bid * 10 : -(team2Bid * 10)}</span>
                        </div>
                        
                        {/* Nils - always show */}
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">Nils:</span>
                          <span className={`font-medium ${team2NilPoints >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team2NilPoints === 0 ? '0' : team2NilPoints}
                          </span>
                        </div>
                        
                        {/* Bags - always show */}
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">Bags:</span>
                          <span className={`font-medium ${team2Bags === 0 ? 'text-gray-400' : 'text-yellow-400'}`}>
                            {team2Bags === 0 ? '0' : team2Bags}
                          </span>
                        </div>
                        
                        {/* Round Score */}
                        <div className="flex justify-between text-xs border-t border-white/10 pt-1">
                          <span className="text-gray-400">Round Score:</span>
                          <span className={`font-bold ${team2Score >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team2Score}
                          </span>
                        </div>
                        
                        {/* Total Score */}
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">Total Score</span>
                          <span className="font-medium text-white">{team2TotalScore}</span>
                        </div>
                        
                        <div className="space-y-1 mt-2">
                          {[1, 3].map((idx) => {
                            const player = gameState.players[idx];
                            if (!player) return null;
                            return (
                              <div key={`team2-${idx}`} className="flex items-center text-xs text-white/90">
                                <div className="bg-blue-500 rounded-full w-1.5 h-1.5 mr-2"></div>
                                <img src={getPlayerAvatar(idx)} alt={getPlayerName(idx)} className="w-4 h-4 rounded-full mr-2 object-cover" />
                                <span className="truncate">{getPlayerName(idx)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Continue Button - Always visible and accessible */}
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    className="w-full sm:w-auto inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
                    onClick={onNextHand}
                  >
                    Next Hand ({timeRemaining}s)
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
