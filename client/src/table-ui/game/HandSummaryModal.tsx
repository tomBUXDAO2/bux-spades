import { useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { isGameOver, getPlayerColor } from '../lib/gameRules';
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
    // Solo mode data
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
  
  // Use total scores for game over check - ALWAYS use gameState as the source of truth
  const team1TotalScore = gameState?.team1TotalScore || 0;
  const team2TotalScore = gameState?.team2TotalScore || 0;

  // Debug logging for score consistency
  console.log('[HAND SUMMARY SCORE DEBUG] Final scores being displayed:', {
    team1TotalScore,
    team2TotalScore,
    handSummaryDataTeam1: handSummaryData?.team1TotalScore,
    handSummaryDataTeam2: handSummaryData?.team2TotalScore,
    gameStateTeam1: gameState?.team1TotalScore,
    gameStateTeam2: gameState?.team2TotalScore
  });

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
    return player.username || (player as any).name || `Player ${index + 1}`;
  };

  // Get player avatar
  const getPlayerAvatar = (index: number) => {
    const player = gameState.players?.[index];
    if (!player) return '/default-pfp.jpg';
    return player.avatar || (player as any).image || '/default-pfp.jpg';
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
                <Dialog.Panel className="w-full max-w-6xl transform overflow-hidden rounded-2xl bg-gray-800 p-6 text-left align-middle shadow-xl transition-all border border-white/20">
                  <Dialog.Title
                    as="h3"
                    className="text-2xl font-bold leading-6 text-white text-center mb-6"
                  >
                    Hand Summary
                  </Dialog.Title>
                  
                  {gameState.gameMode === 'SOLO' ? (
                    // Solo mode - Column-based layout with colored borders
                    <div className="bg-gray-700 rounded-lg p-6 border-4 border-gray-600">
                      {/* Column-based layout */}
                      <div className="grid grid-cols-5 gap-4">
                        {/* Row Headers Column */}
                        <div className="space-y-3">
                          <div className="text-gray-400 font-semibold text-sm h-16 flex items-center">Player</div>
                          <div className="text-gray-300 text-sm font-medium h-12 flex items-center">Bid</div>
                          <div className="text-gray-300 text-sm font-medium h-12 flex items-center">Tricks</div>
                          <div className="text-gray-300 text-sm font-medium h-12 flex items-center">Trick Score</div>
                          <div className="text-gray-300 text-sm font-medium h-12 flex items-center">Bag Score</div>
                          <div className="text-gray-300 text-sm font-medium h-12 flex items-center">Bag Penalty</div>
                          <div className="text-white text-sm font-bold h-12 flex items-center border-t border-gray-600 pt-3">Round Total</div>
                          <div className="text-white text-lg font-bold h-12 flex items-center border-t border-gray-600 pt-3">Final Score</div>
                        </div>

                        {/* Player Columns */}
                        {[0, 1, 2, 3].map((playerIndex) => {
                          const playerColor = getPlayerColor(playerIndex);
                          const playerName = getPlayerName(playerIndex);
                          const playerAvatar = getPlayerAvatar(playerIndex);
                          const playerBid = getPlayerBid(playerIndex);
                          const playerTricks = getPlayerTricks(playerIndex);
                          const playerBags = handSummaryData?.playerBags?.[playerIndex] || gameState.playerBags?.[playerIndex] || 0;
                          const playerScore = handSummaryData?.playerScores?.[playerIndex] || gameState.playerScores?.[playerIndex] || 0;
                          
                          // Calculate scores
                          const trickScore = playerTricks >= playerBid ? playerBid * 10 : -playerBid * 10;
                          const bagScore = Math.max(0, playerTricks - playerBid);
                          const bagPenalty = playerBags >= 10 ? -100 : 0;
                          const handTotal = trickScore + bagScore + bagPenalty;
                          
                          // Border colors for each player
                          const borderColors = [
                            'border-red-500',    // Player 0: Red
                            'border-blue-500',   // Player 1: Blue
                            'border-orange-500', // Player 2: Orange
                            'border-purple-500'  // Player 3: Purple
                          ];
                          const playerBorderColor = borderColors[playerIndex];
                          
                          return (
                            <div key={playerIndex} className={`space-y-3 border-4 ${playerBorderColor} rounded-lg p-3`}>
                              {/* Player Header */}
                              <div className="flex flex-col items-center h-16 justify-center">
                                <img 
                                  src={playerAvatar} 
                                  alt={playerName} 
                                  className="w-8 h-8 rounded-full border-2 border-white/20 mb-1"
                                />
                                <div className="flex items-center gap-1">
                                  <div className={`${playerColor.bg} rounded-full w-2 h-2`}></div>
                                  <span className="text-white font-semibold text-xs">{playerName}</span>
                                </div>
                              </div>

                              {/* Bid */}
                              <div className="text-white text-center font-semibold h-12 flex items-center justify-center">
                                {playerBid}
                              </div>

                              {/* Tricks */}
                              <div className="text-white text-center font-semibold h-12 flex items-center justify-center">
                                {playerTricks}
                              </div>

                              {/* Trick Score */}
                              <div className={`text-center font-semibold h-12 flex items-center justify-center ${trickScore >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {trickScore}
                              </div>

                              {/* Bag Score */}
                              <div className={`text-center font-semibold h-12 flex items-center justify-center ${bagScore >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {bagScore}
                              </div>

                              {/* Bag Penalty */}
                              <div className={`text-center font-semibold h-12 flex items-center justify-center ${bagPenalty === 0 ? 'text-gray-400' : 'text-red-400'}`}>
                                {bagPenalty}
                              </div>

                              {/* Round Total */}
                              <div className={`text-center font-bold text-lg h-12 flex items-center justify-center ${handTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {handTotal}
                              </div>

                              {/* Final Score */}
                              <div className={`text-center font-bold text-xl h-12 flex items-center justify-center ${playerScore >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {playerScore}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    // Partners mode - Team-based layout with individual bid/made columns
                    <div className="bg-gray-700 rounded-lg p-6 border-4 border-gray-600">
                      {/* Team-based layout */}
                      <div className="grid grid-cols-7 gap-4">
                        {/* Row Headers Column */}
                        <div className="space-y-3">
                          <div className="text-gray-400 font-semibold text-sm h-16 flex items-center">Team</div>
                          <div className="text-gray-300 text-sm font-medium h-12 flex items-center">Bid</div>
                          <div className="text-gray-300 text-sm font-medium h-12 flex items-center">Made</div>
                          <div className="text-gray-300 text-sm font-medium h-12 flex items-center">Trick Score</div>
                          <div className="text-gray-300 text-sm font-medium h-12 flex items-center">Bag Score</div>
                          <div className="text-gray-300 text-sm font-medium h-12 flex items-center">Bag Penalty</div>
                          <div className="text-gray-300 text-sm font-medium h-12 flex items-center">Nil Bonus</div>
                          <div className="text-white text-sm font-bold h-12 flex items-center border-t border-gray-600 pt-3">Round Total</div>
                          <div className="text-white text-lg font-bold h-12 flex items-center border-t border-gray-600 pt-3">Final Score</div>
                        </div>

                        {/* Red Team Column (Players 1, 3) */}
                        <div className="space-y-3 border-4 border-red-500 rounded-lg p-3">
                          {/* Team Header */}
                          <div className="flex flex-col items-center h-16 justify-center">
                            <div className="flex items-center gap-2 mb-1">
                              <img 
                                src={getPlayerAvatar(1)} 
                                alt={getPlayerName(1)} 
                                className="w-6 h-6 rounded-full border border-white/20"
                              />
                              <img 
                                src={getPlayerAvatar(3)} 
                                alt={getPlayerName(3)} 
                                className="w-6 h-6 rounded-full border border-white/20"
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="bg-red-500 rounded-full w-2 h-2"></div>
                              <span className="text-white font-semibold text-xs">Red Team</span>
                            </div>
                          </div>

                          {/* Team Bid (sum of individual bids) */}
                          <div className="text-white text-center font-semibold h-12 flex items-center justify-center">
                            {getPlayerBid(1) + getPlayerBid(3)}
                          </div>

                          {/* Team Made (sum of individual tricks) */}
                          <div className="text-white text-center font-semibold h-12 flex items-center justify-center">
                            {getPlayerTricks(1) + getPlayerTricks(3)}
                          </div>

                          {/* Trick Score - Team combined */}
                          <div className={`text-center font-semibold h-12 flex items-center justify-center ${team2TrickScore >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team2TrickScore}
                          </div>

                          {/* Bag Score - Team combined */}
                          <div className={`text-center font-semibold h-12 flex items-center justify-center ${team2BagScore >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team2BagScore}
                          </div>

                          {/* Bag Penalty - Team combined */}
                          <div className={`text-center font-semibold h-12 flex items-center justify-center ${team2BagPenalty === 0 ? 'text-gray-400' : 'text-red-400'}`}>
                            {team2BagPenalty}
                          </div>

                          {/* Nil Bonus - Team combined */}
                          <div className={`text-center font-semibold h-12 flex items-center justify-center ${team2NilBonus === 0 ? 'text-gray-400' : team2NilBonus >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team2NilBonus}
                          </div>

                          {/* Round Total - Team combined */}
                          <div className={`text-center font-bold text-lg h-12 flex items-center justify-center ${team2HandTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team2HandTotal}
                          </div>

                          {/* Final Score - Team combined */}
                          <div className={`text-center font-bold text-xl h-12 flex items-center justify-center ${team2TotalScore >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team2TotalScore}
                          </div>
                        </div>

                        {/* Individual Bid/Made for Red Team Player 1 */}
                        <div className="space-y-3 border-2 border-red-400 rounded-lg p-3">
                          {/* Player Header */}
                          <div className="flex flex-col items-center h-16 justify-center">
                            <img 
                              src={getPlayerAvatar(1)} 
                              alt={getPlayerName(1)} 
                              className="w-8 h-8 rounded-full border-2 border-white/20 mb-1"
                            />
                            <span className="text-white font-semibold text-xs">{getPlayerName(1)}</span>
                          </div>

                          {/* Individual Bid */}
                          <div className="text-white text-center font-semibold h-12 flex items-center justify-center">
                            {getPlayerBid(1)}
                          </div>

                          {/* Individual Made */}
                          <div className="text-white text-center font-semibold h-12 flex items-center justify-center">
                            {getPlayerTricks(1)}
                          </div>

                          {/* Empty cells for team data */}
                          <div className="h-12"></div>
                          <div className="h-12"></div>
                          <div className="h-12"></div>
                          <div className="h-12"></div>
                          <div className="h-12"></div>
                          <div className="h-12"></div>
                        </div>

                        {/* Individual Bid/Made for Red Team Player 3 */}
                        <div className="space-y-3 border-2 border-red-400 rounded-lg p-3">
                          {/* Player Header */}
                          <div className="flex flex-col items-center h-16 justify-center">
                            <img 
                              src={getPlayerAvatar(3)} 
                              alt={getPlayerName(3)} 
                              className="w-8 h-8 rounded-full border-2 border-white/20 mb-1"
                            />
                            <span className="text-white font-semibold text-xs">{getPlayerName(3)}</span>
                          </div>

                          {/* Individual Bid */}
                          <div className="text-white text-center font-semibold h-12 flex items-center justify-center">
                            {getPlayerBid(3)}
                          </div>

                          {/* Individual Made */}
                          <div className="text-white text-center font-semibold h-12 flex items-center justify-center">
                            {getPlayerTricks(3)}
                          </div>

                          {/* Empty cells for team data */}
                          <div className="h-12"></div>
                          <div className="h-12"></div>
                          <div className="h-12"></div>
                          <div className="h-12"></div>
                          <div className="h-12"></div>
                          <div className="h-12"></div>
                        </div>

                        {/* Blue Team Column (Players 0, 2) */}
                        <div className="space-y-3 border-4 border-blue-500 rounded-lg p-3">
                          {/* Team Header */}
                          <div className="flex flex-col items-center h-16 justify-center">
                            <div className="flex items-center gap-2 mb-1">
                              <img 
                                src={getPlayerAvatar(0)} 
                                alt={getPlayerName(0)} 
                                className="w-6 h-6 rounded-full border border-white/20"
                              />
                              <img 
                                src={getPlayerAvatar(2)} 
                                alt={getPlayerName(2)} 
                                className="w-6 h-6 rounded-full border border-white/20"
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="bg-blue-500 rounded-full w-2 h-2"></div>
                              <span className="text-white font-semibold text-xs">Blue Team</span>
                            </div>
                          </div>

                          {/* Team Bid (sum of individual bids) */}
                          <div className="text-white text-center font-semibold h-12 flex items-center justify-center">
                            {getPlayerBid(0) + getPlayerBid(2)}
                          </div>

                          {/* Team Made (sum of individual tricks) */}
                          <div className="text-white text-center font-semibold h-12 flex items-center justify-center">
                            {getPlayerTricks(0) + getPlayerTricks(2)}
                          </div>

                          {/* Trick Score - Team combined */}
                          <div className={`text-center font-semibold h-12 flex items-center justify-center ${team1TrickScore >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team1TrickScore}
                          </div>

                          {/* Bag Score - Team combined */}
                          <div className={`text-center font-semibold h-12 flex items-center justify-center ${team1BagScore >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team1BagScore}
                          </div>

                          {/* Bag Penalty - Team combined */}
                          <div className={`text-center font-semibold h-12 flex items-center justify-center ${team1BagPenalty === 0 ? 'text-gray-400' : 'text-red-400'}`}>
                            {team1BagPenalty}
                          </div>

                          {/* Nil Bonus - Team combined */}
                          <div className={`text-center font-semibold h-12 flex items-center justify-center ${team1NilBonus === 0 ? 'text-gray-400' : team1NilBonus >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team1NilBonus}
                          </div>

                          {/* Round Total - Team combined */}
                          <div className={`text-center font-bold text-lg h-12 flex items-center justify-center ${team1HandTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team1HandTotal}
                          </div>

                          {/* Final Score - Team combined */}
                          <div className={`text-center font-bold text-xl h-12 flex items-center justify-center ${team1TotalScore >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {team1TotalScore}
                          </div>
                        </div>

                        {/* Individual Bid/Made for Blue Team Player 0 */}
                        <div className="space-y-3 border-2 border-blue-400 rounded-lg p-3">
                          {/* Player Header */}
                          <div className="flex flex-col items-center h-16 justify-center">
                            <img 
                              src={getPlayerAvatar(0)} 
                              alt={getPlayerName(0)} 
                              className="w-8 h-8 rounded-full border-2 border-white/20 mb-1"
                            />
                            <span className="text-white font-semibold text-xs">{getPlayerName(0)}</span>
                          </div>

                          {/* Individual Bid */}
                          <div className="text-white text-center font-semibold h-12 flex items-center justify-center">
                            {getPlayerBid(0)}
                          </div>

                          {/* Individual Made */}
                          <div className="text-white text-center font-semibold h-12 flex items-center justify-center">
                            {getPlayerTricks(0)}
                          </div>

                          {/* Empty cells for team data */}
                          <div className="h-12"></div>
                          <div className="h-12"></div>
                          <div className="h-12"></div>
                          <div className="h-12"></div>
                          <div className="h-12"></div>
                          <div className="h-12"></div>
                        </div>

                        {/* Individual Bid/Made for Blue Team Player 2 */}
                        <div className="space-y-3 border-2 border-blue-400 rounded-lg p-3">
                          {/* Player Header */}
                          <div className="flex flex-col items-center h-16 justify-center">
                            <img 
                              src={getPlayerAvatar(2)} 
                              alt={getPlayerName(2)} 
                              className="w-8 h-8 rounded-full border-2 border-white/20 mb-1"
                            />
                            <span className="text-white font-semibold text-xs">{getPlayerName(2)}</span>
                          </div>

                          {/* Individual Bid */}
                          <div className="text-white text-center font-semibold h-12 flex items-center justify-center">
                            {getPlayerBid(2)}
                          </div>

                          {/* Individual Made */}
                          <div className="text-white text-center font-semibold h-12 flex items-center justify-center">
                            {getPlayerTricks(2)}
                          </div>

                          {/* Empty cells for team data */}
                          <div className="h-12"></div>
                          <div className="h-12"></div>
                          <div className="h-12"></div>
                          <div className="h-12"></div>
                          <div className="h-12"></div>
                          <div className="h-12"></div>
                        </div>
                      </div>
                    </div>
                  )}

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
