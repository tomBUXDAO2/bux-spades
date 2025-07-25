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
  };
}

export default function HandSummaryModal({
  isOpen,
  onClose,
  gameState,
  onNextHand,
  handSummaryData
}: HandSummaryModalProps) {
  console.log('HandSummaryModal rendered with data:', {
    isOpen,
    handSummaryData,
    gameState: {
      team1TotalScore: gameState?.team1TotalScore,
      team2TotalScore: gameState?.team2TotalScore,
      team1Bags: gameState?.team1Bags,
      team2Bags: gameState?.team2Bags,
      bidding: gameState?.bidding?.bids,
      players: gameState?.players?.map(p => ({ tricks: p?.tricks, bid: p?.bid }))
    }
  });
  const [timeRemaining, setTimeRemaining] = useState(12);
  
  // Use total scores for game over check
  const team1TotalScore = handSummaryData?.team1TotalScore || gameState?.team1TotalScore || 0;
  const team2TotalScore = handSummaryData?.team2TotalScore || gameState?.team2TotalScore || 0;

  // Check if game is over using the GameState
  const gameIsOver = isGameOver(gameState);
  console.log('[HAND SUMMARY] gameIsOver check:', gameIsOver, 'gameState.team1TotalScore:', gameState.team1TotalScore, 'gameState.team2TotalScore:', gameState.team2TotalScore);
  if (gameIsOver) {
    console.log('[HAND SUMMARY] Game is over, returning null');
    return null;
  }

  // Timer effect for auto-advancing to next hand
  useEffect(() => {
    if (!isOpen || gameIsOver) {
      // Clear timer if game is over
      setTimeRemaining(0);
      return;
    }
    
    console.log('HandSummaryModal timer started, timeRemaining:', timeRemaining);
    
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        console.log('Timer tick, prev:', prev);
        if (prev <= 1) {
          // Auto-advance to next hand
          console.log('[TIMER] Timer reached 0, calling onNextHand()');
          return 0; // Set to 0 to trigger the effect below
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      console.log('Clearing timer');
      clearInterval(timer);
    };
  }, [isOpen, gameIsOver]);

  // Effect to handle timer completion
  useEffect(() => {
    if (timeRemaining === 0 && !gameIsOver && isOpen) {
      console.log('[TIMER] Timer completed, calling onNextHand() and onClose()');
      console.log('[TIMER] onNextHand function:', onNextHand);
      console.log('[TIMER] onClose function:', onClose);
      onNextHand();
      onClose();
    }
  }, [timeRemaining, onNextHand, onClose, gameIsOver, isOpen]);

  // Reset timer when modal opens
  useEffect(() => {
    if (isOpen && !gameIsOver) {
      setTimeRemaining(12);
    } else if (isOpen && gameIsOver) {
      setTimeRemaining(0);
    }
  }, [isOpen, gameIsOver]);

  // Don't show winner/loser modals in HandSummaryModal - GameTable will handle that
  // useEffect(() => {
  //   if (gameIsOver) {
  //     console.log('[HAND SUMMARY] Game is over, determining winner');
  //     const winningTeam = getWinningTeam(gameState);
  //     console.log('[HAND SUMMARY] Winning team:', winningTeam);
  //     
  //     if (winningTeam === 'team1') {
  //       setShowWinnerModal(true);
  //     } else if (winningTeam === 'team2') {
  //       setShowLoserModal(true);
  //     }
  //     
  //     // Don't auto-advance to next hand when game is over
  //     return;
  //   }
  // }, [gameIsOver, gameState]);

  // Calculate team bids and tricks
  const team1Bid = (gameState.bidding?.bids?.[0] || 0) + (gameState.bidding?.bids?.[2] || 0);
  const team2Bid = (gameState.bidding?.bids?.[1] || 0) + (gameState.bidding?.bids?.[3] || 0);
  
  // Use server-calculated trick counts from handSummaryData if available, otherwise fallback to gameState
  const tricksPerPlayer = handSummaryData?.tricksPerPlayer || [
    gameState.players?.[0]?.tricks || 0,
    gameState.players?.[1]?.tricks || 0,
    gameState.players?.[2]?.tricks || 0,
    gameState.players?.[3]?.tricks || 0
  ];
  
  console.log('[HAND SUMMARY DEBUG] handSummaryData.tricksPerPlayer:', handSummaryData?.tricksPerPlayer);
  console.log('[HAND SUMMARY DEBUG] gameState.players tricks:', gameState.players?.map(p => p?.tricks || 0));
  console.log('[HAND SUMMARY DEBUG] Final tricksPerPlayer:', tricksPerPlayer);
  console.log('[HAND SUMMARY DEBUG] Total tricks:', tricksPerPlayer.reduce((a, b) => a + b, 0));
  
  const team1Tricks = tricksPerPlayer[0] + tricksPerPlayer[2];
  const team2Tricks = tricksPerPlayer[1] + tricksPerPlayer[3];
  
  console.log('[HAND SUMMARY DEBUG] Team 1 tricks:', team1Tricks, '(', tricksPerPlayer[0], '+', tricksPerPlayer[2], ')');
  console.log('[HAND SUMMARY DEBUG] Team 2 tricks:', team2Tricks, '(', tricksPerPlayer[1], '+', tricksPerPlayer[3], ')');

  // Calculate trick scores
  const team1TrickScore = team1Tricks >= team1Bid ? team1Bid * 10 : -team1Bid * 10;
  const team2TrickScore = team2Tricks >= team2Bid ? team2Bid * 10 : -team2Bid * 10;

  // Calculate bag scores (excess tricks beyond bid)
  const team1BagScore = Math.max(0, team1Tricks - team1Bid);
  const team2BagScore = Math.max(0, team2Tricks - team2Bid);

  // Get running total bags from game state
  const team1RunningBags = gameState.team1Bags || 0;
  const team2RunningBags = gameState.team2Bags || 0;

  // Calculate bag penalties based on running total bags
  // Bag penalty applies when running total reaches 10 or more
  const team1BagPenalty = (team1RunningBags + team1BagScore) >= 10 ? -100 : 0;
  const team2BagPenalty = (team2RunningBags + team2BagScore) >= 10 ? -100 : 0;

  // Debug logging for bag penalty calculation
  console.log('[HAND SUMMARY] Bag penalty calculation:', {
    team1RunningBags,
    team1BagScore,
    team1TotalBags: team1RunningBags + team1BagScore,
    team1BagPenalty,
    team2RunningBags,
    team2BagScore,
    team2TotalBags: team2RunningBags + team2BagScore,
    team2BagPenalty
  });

  // Calculate nil bonuses
  const calculateNilBonus = (team: number[]) => {
    let bonus = 0;
    for (const playerIndex of team) {
      const bid = gameState.bidding?.bids?.[playerIndex] || 0;
      const tricks = gameState.players?.[playerIndex]?.tricks || 0;
      
      if (bid === 0) { // Nil bid
        if (tricks === 0) {
          bonus += 100; // Successful nil
        } else {
          bonus -= 100; // Failed nil
        }
      } else if (bid === -1) { // Blind nil
        if (tricks === 0) {
          bonus += 200; // Successful blind nil
        } else {
          bonus -= 200; // Failed blind nil
        }
      }
    }
    return bonus;
  };

  const team1NilBonus = calculateNilBonus([0, 2]);
  const team2NilBonus = calculateNilBonus([1, 3]);

  // Calculate total hand scores
  const team1HandTotal = team1TrickScore + team1BagScore + team1BagPenalty + team1NilBonus;
  const team2HandTotal = team2TrickScore + team2BagScore + team2BagPenalty + team2NilBonus;

  // Get player names
  const getPlayerName = (index: number) => {
    const player = gameState.players?.[index];
    if (!player) return `Player ${index + 1}`;
    return player.username || `Player ${index + 1}`;
  };

  const getPlayerBid = (index: number) => {
    return gameState.bidding?.bids?.[index] || 0;
  };

  const getPlayerTricks = (index: number) => {
    return gameState.players?.[index]?.tricks || 0;
  };

    return (
      <>
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
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-gray-800 p-6 text-left align-middle shadow-xl transition-all border border-white/20">
                  <Dialog.Title
                    as="h3"
                    className="text-2xl font-bold leading-6 text-white text-center mb-6"
                  >
                    Hand Summary
                  </Dialog.Title>
                  
                  <div className="grid grid-cols-2 gap-8">
                    {/* Blue Team */}
                    <div className="bg-gray-700 rounded-lg p-4 border border-white/20">
                      <h4 className="text-xl font-semibold text-blue-400 mb-4 text-center">Blue Team</h4>
                      
                      {/* Player Details */}
                      <div className="space-y-3 mb-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">{getPlayerName(0)}</span>
                          <span className="text-white">{getPlayerTricks(0)} / {getPlayerBid(0)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">{getPlayerName(2)}</span>
                          <span className="text-white">{getPlayerTricks(2)} / {getPlayerBid(2)}</span>
                        </div>
                      </div>

                      {/* Team Totals */}
                      <div className="border-t border-gray-600 pt-3 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">Team Bid:</span>
                          <span className="text-white">{team1Bid}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">Team Tricks:</span>
                          <span className="text-white">{team1Tricks}</span>
                        </div>
                      </div>

                      {/* Scoring Breakdown */}
                      <div className="border-t border-gray-600 pt-3 space-y-2 mt-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">Trick Score:</span>
                          <span className={`font-semibold ${team1TrickScore >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team1TrickScore >= 0 ? '+' : ''}{team1TrickScore}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">Bag Score:</span>
                          <span className={`font-semibold ${team1BagScore >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team1BagScore >= 0 ? '+' : ''}{team1BagScore}
                          </span>
                        </div>
                        {team1BagPenalty !== 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-300">Bag Penalty:</span>
                            <span className="text-red-400 font-semibold">{team1BagPenalty}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">Nil Bonus:</span>
                          <span className={`font-semibold ${team1NilBonus >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team1NilBonus >= 0 ? '+' : ''}{team1NilBonus}
                          </span>
                        </div>
                        <div className="flex justify-between text-lg font-bold border-t border-gray-600 pt-2">
                          <span className="text-white">Round:</span>
                          <span className={`${team1HandTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team1HandTotal >= 0 ? '+' : ''}{team1HandTotal}
                          </span>
                        </div>
                      </div>

                      {/* Running Total */}
                      <div className="border-t border-gray-600 pt-3 mt-4">
                        <div className="flex justify-between text-xl font-bold">
                          <span className="text-blue-300">Score:</span>
                          <span className={`${team1TotalScore >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team1TotalScore >= 0 ? '+' : ''}{team1TotalScore}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Red Team */}
                    <div className="bg-gray-700 rounded-lg p-4 border border-white/20">
                      <h4 className="text-xl font-semibold text-red-400 mb-4 text-center">Red Team</h4>
                      
                      {/* Player Details */}
                      <div className="space-y-3 mb-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">{getPlayerName(1)}</span>
                          <span className="text-white">{getPlayerTricks(1)} / {getPlayerBid(1)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">{getPlayerName(3)}</span>
                          <span className="text-white">{getPlayerTricks(3)} / {getPlayerBid(3)}</span>
                        </div>
                      </div>

                      {/* Team Totals */}
                      <div className="border-t border-gray-600 pt-3 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">Team Bid:</span>
                          <span className="text-white">{team2Bid}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">Team Tricks:</span>
                          <span className="text-white">{team2Tricks}</span>
                        </div>
                      </div>

                      {/* Scoring Breakdown */}
                      <div className="border-t border-gray-600 pt-3 space-y-2 mt-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">Trick Score:</span>
                          <span className={`font-semibold ${team2TrickScore >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team2TrickScore >= 0 ? '+' : ''}{team2TrickScore}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">Bag Score:</span>
                          <span className={`font-semibold ${team2BagScore >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team2BagScore >= 0 ? '+' : ''}{team2BagScore}
                          </span>
                        </div>
                        {team2BagPenalty !== 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-300">Bag Penalty:</span>
                            <span className="text-red-400 font-semibold">{team2BagPenalty}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">Nil Bonus:</span>
                          <span className={`font-semibold ${team2NilBonus >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team2NilBonus >= 0 ? '+' : ''}{team2NilBonus}
                          </span>
                        </div>
                        <div className="flex justify-between text-lg font-bold border-t border-gray-600 pt-2">
                          <span className="text-white">Round:</span>
                          <span className={`${team2HandTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team2HandTotal >= 0 ? '+' : ''}{team2HandTotal}
                          </span>
                        </div>
                      </div>

                      {/* Running Total */}
                      <div className="border-t border-gray-600 pt-3 mt-4">
                        <div className="flex justify-between text-xl font-bold">
                          <span className="text-red-300">Score:</span>
                          <span className={`${team2TotalScore >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team2TotalScore >= 0 ? '+' : ''}{team2TotalScore}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-center">
                    {!gameIsOver ? (
                      <button
                        type="button"
                        className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-6 py-3 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
                        onClick={onNextHand}
                      >
                        Next Hand ({timeRemaining}s)
                      </button>
                    ) : (
                      <div className="text-center">
                        <p className="text-yellow-400 font-semibold mb-2">Game Over!</p>
                        <p className="text-gray-300 text-sm">The game has ended. Check the winner/loser modal.</p>
                      </div>
                    )}
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

          {/* Winner/Loser modals are handled by GameTable component */}
    </>
  );
} 