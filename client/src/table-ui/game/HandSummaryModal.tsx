import { useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { isGameOver } from '../lib/gameRules';
import type { GameState } from '../../types/game';
import { useEffect } from 'react';

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
  onClose,
  gameState,
  onNextHand,
  handSummaryData
}: HandSummaryModalProps) {
  const [timeRemaining, setTimeRemaining] = useState(12);
  
  // Use gameState as source of truth for scores
  const team1TotalScore = gameState?.team1TotalScore || 0;
  const team2TotalScore = gameState?.team2TotalScore || 0;

  // Check if game is over
  const gameIsOver = isGameOver(gameState);
  if (gameIsOver) {
    return null;
  }

  // Timer effect for auto-advancing to next hand
  useEffect(() => {
    if (!isOpen || gameIsOver) {
      setTimeRemaining(0);
      return;
    }
    
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, gameIsOver]);

  // Effect to handle timer completion
  useEffect(() => {
    if (timeRemaining === 0 && !gameIsOver && isOpen) {
      onNextHand();
      onClose();
    }
  }, [timeRemaining, onNextHand, onClose, gameIsOver, isOpen]);

  // Reset timer when modal opens
  useEffect(() => {
    if (isOpen && !gameIsOver) {
      setTimeRemaining(12);
    }
  }, [isOpen, gameIsOver]);

  // Get player names
  const getPlayerName = (index: number) => {
    const player = gameState.players?.[index];
    if (!player) return `Player ${index + 1}`;
    return player.username || (player as any).name || `Player ${index + 1}`;
  };

  // Get player avatar
  const getPlayerAvatar = (index: number) => {
    const player = gameState.players?.[index];
    if (!player) return '/default-pfp.jpg';
    return player.avatar || (player as any).image || '/default-pfp.jpg';
  };

  // Calculate team data - use same logic as GameTable
  // Team 1 (positions 0,2) = Red Team
  // Team 2 (positions 1,3) = Blue Team
  const redTeamBid = (gameState.bidding?.bids?.[0] || 0) + (gameState.bidding?.bids?.[2] || 0);
  const blueTeamBid = (gameState.bidding?.bids?.[1] || 0) + (gameState.bidding?.bids?.[3] || 0);
  
  const tricksPerPlayer = handSummaryData?.tricksPerPlayer || [
    gameState.players?.[0]?.tricks || 0,
    gameState.players?.[1]?.tricks || 0,
    gameState.players?.[2]?.tricks || 0,
    gameState.players?.[3]?.tricks || 0
  ];
  
  const redTeamTricks = tricksPerPlayer[0] + tricksPerPlayer[2];
  const blueTeamTricks = tricksPerPlayer[1] + tricksPerPlayer[3];

  // Calculate scores
  const redTeamTrickScore = redTeamTricks >= redTeamBid ? redTeamBid * 10 : -redTeamBid * 10;
  const blueTeamTrickScore = blueTeamTricks >= blueTeamBid ? blueTeamBid * 10 : -blueTeamBid * 10;
  const redTeamBagScore = Math.max(0, redTeamTricks - redTeamBid);
  const blueTeamBagScore = Math.max(0, blueTeamTricks - blueTeamBid);

  // Calculate nil bonuses
  const calculateNilBonus = (team: number[]) => {
    let bonus = 0;
    for (const playerIndex of team) {
      const bid = gameState.bidding?.bids?.[playerIndex] || 0;
      const tricks = gameState.players?.[playerIndex]?.tricks || 0;
      
      if (bid === 0 && tricks === 0) {
        bonus += 100; // Successful nil
      } else if (bid === 0 && tricks > 0) {
        bonus -= 100; // Failed nil
      } else if (bid === -1 && tricks === 0) {
        bonus += 200; // Successful blind nil
      } else if (bid === -1 && tricks > 0) {
        bonus -= 200; // Failed blind nil
      }
    }
    return bonus;
  };

  const redTeamNilBonus = calculateNilBonus([0, 2]);
  const blueTeamNilBonus = calculateNilBonus([1, 3]);

  // Calculate hand totals
  // Calculate hand totals - USE BACKEND SCORES when available
  const redTeamHandTotal = handSummaryData?.team1Score || (redTeamTrickScore + redTeamBagScore + redTeamNilBonus);
  const blueTeamHandTotal = handSummaryData?.team2Score || (blueTeamTrickScore + blueTeamBagScore + blueTeamNilBonus);
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={onClose}>
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
          <div className="flex min-h-full items-center justify-center p-2 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-sm transform overflow-hidden rounded-lg bg-gray-800 p-4 text-left align-middle shadow-xl transition-all border border-white/20">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-bold leading-6 text-white text-center mb-4"
                >
                  Hand Summary
                </Dialog.Title>
                
                {gameState.gameMode === 'SOLO' ? (
                  // Solo mode - compact layout
                  <div className="space-y-3">
                    {[0, 1, 2, 3].map((playerIndex) => {
                      const playerName = getPlayerName(playerIndex);
                      const playerAvatar = getPlayerAvatar(playerIndex);
                      const playerBid = gameState.bidding?.bids?.[playerIndex] || 0;
                      const playerTricks = gameState.players?.[playerIndex]?.tricks || 0;
                      const trickScore = playerTricks >= playerBid ? playerBid * 10 : -playerBid * 10;
                      const bagScore = Math.max(0, playerTricks - playerBid);
                      const handTotal = trickScore + bagScore;
                      
                      return (
                        <div key={playerIndex} className="flex items-center justify-between bg-gray-700 rounded-lg p-3">
                          <div className="flex items-center gap-2">
                            <img 
                              src={playerAvatar} 
                              alt={playerName} 
                              className="w-6 h-6 rounded-full"
                            />
                            <span className="text-white text-sm font-medium">{playerName}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-white text-xs">Bid: {playerBid} | Made: {playerTricks}</div>
                            <div className={`text-sm font-bold ${handTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {handTotal}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  // Partners mode - compact team layout
                  <div className="space-y-4">
                    {/* Red Team */}
                    <div className="bg-red-900/30 border border-red-500 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                          <span className="text-white font-semibold text-sm">Red Team</span>
                        </div>
                        <div className="text-right">
                          <div className="text-white text-xs">Bid: {redTeamBid} | Made: {redTeamTricks}</div>
                          <div className={`text-sm font-bold ${redTeamHandTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {redTeamHandTotal}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-300">
                        <div>{getPlayerName(0)}: {gameState.bidding?.bids?.[0] || 0} bid, {tricksPerPlayer[0]} made</div>
                        <div>{getPlayerName(2)}: {gameState.bidding?.bids?.[2] || 0} bid, {tricksPerPlayer[2]} made</div>
                      </div>
                    </div>

                    {/* Blue Team */}
                    <div className="bg-blue-900/30 border border-blue-500 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                          <span className="text-white font-semibold text-sm">Blue Team</span>
                        </div>
                        <div className="text-right">
                          <div className="text-white text-xs">Bid: {blueTeamBid} | Made: {blueTeamTricks}</div>
                          <div className={`text-sm font-bold ${blueTeamHandTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {blueTeamHandTotal}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-300">
                        <div>{getPlayerName(1)}: {gameState.bidding?.bids?.[1] || 0} bid, {tricksPerPlayer[1]} made</div>
                        <div>{getPlayerName(3)}: {gameState.bidding?.bids?.[3] || 0} bid, {tricksPerPlayer[3]} made</div>
                      </div>
                    </div>

                    {/* Total Scores */}
                    <div className="flex justify-between items-center bg-gray-700 rounded-lg p-3">
                      <span className="text-white font-semibold">Total Scores:</span>
                      <div className="text-right">
                        <div className="text-red-400 text-sm">Red: {team1TotalScore}</div>
                        <div className="text-blue-400 text-sm">Blue: {team2TotalScore}</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
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
