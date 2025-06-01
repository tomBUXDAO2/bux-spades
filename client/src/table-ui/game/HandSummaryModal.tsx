import { calculateHandScore, isGameOver } from '../../lib/scoring';
import type { Player, HandSummary, TeamScore } from '../types/game';
import WinnerModal from './WinnerModal';
import LoserModal from './LoserModal';
import { useEffect, useState } from 'react';

interface HandSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  handScores: HandSummary | null;
  minPoints: number;
  maxPoints: number;
  onGameOver: (winner: 1 | 2) => void;
}

export default function HandSummaryModal({
  isOpen,
  onClose,
  handScores,
  minPoints = -250,
  maxPoints = 500,
  onGameOver
}: HandSummaryModalProps) {
  // Add null checks for handScores
  const team1HandScore = handScores?.team1Score?.score || 0;
  const team2HandScore = handScores?.team2Score?.score || 0;
  const team1Bid = handScores?.team1Score?.bid || 0;
  const team2Bid = handScores?.team2Score?.bid || 0;
  const team1Tricks = handScores?.team1Score?.tricks || 0;
  const team2Tricks = handScores?.team2Score?.tricks || 0;
  
  // Use total scores for game over check
  const team1Score = handScores?.totalScores?.team1 || 0;
  const team2Score = handScores?.totalScores?.team2 || 0;
  
  // Calculate bags as tricks over bid
  const team1Bags = team1Tricks > team1Bid ? team1Tricks - team1Bid : 0;
  const team2Bags = team2Tricks > team2Bid ? team2Tricks - team2Bid : 0;
  const team1NilBids = handScores?.team1Score?.nilBids || 0;
  const team2NilBids = handScores?.team2Score?.nilBids || 0;
  const team1MadeNils = handScores?.team1Score?.madeNils || 0;
  const team2MadeNils = handScores?.team2Score?.madeNils || 0;
  
  // Check if game is over using total scores
  const { isOver: gameIsOver, winner } = isGameOver(team1Score, team2Score, minPoints, maxPoints);
  
  // State for winner/loser modals
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [showLoserModal, setShowLoserModal] = useState(false);
  
  // Call onGameOver if game is over
  useEffect(() => {
    if (gameIsOver && winner && onGameOver) {
      onGameOver(winner);
      
      // Show appropriate modal based on winner
      if (winner === 1) {
        setShowWinnerModal(true);
      } else {
        setShowLoserModal(true);
      }
    }
  }, [gameIsOver, winner, onGameOver]);
  
  if (!isOpen) return null;
  
  // If game is over, show winner/loser modal instead of hand summary
  if (gameIsOver && winner) {
    return (
      <>
        {winner === 1 ? (
          <WinnerModal 
            isOpen={showWinnerModal} 
            onClose={onClose} 
            team1Score={team1Score} 
            team2Score={team2Score} 
            winningTeam={1} 
          />
        ) : (
          <LoserModal 
            isOpen={showLoserModal} 
            onClose={onClose} 
            team1Score={team1Score} 
            team2Score={team2Score} 
            winningTeam={2} 
          />
        )}
      </>
    );
  }
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-900/75 rounded-lg p-3 max-w-xs w-full shadow-xl border border-gray-700">
        <h2 className="text-lg font-bold text-white mb-3 text-center">Hand Summary</h2>
        
        <div className="grid grid-cols-2 gap-3">
          {/* Team 1 (Red) */}
          <div className="bg-gray-800/50 backdrop-blur rounded-lg p-2 border border-white/5">
            <div className="flex items-center mb-1">
              <div className="bg-red-500 rounded-full w-2 h-2 mr-1"></div>
              <h3 className="text-base font-semibold text-white">Team 1</h3>
            </div>
            
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Hand Score</span>
                <span className="font-medium text-white">{team1HandScore}</span>
              </div>
              
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Total Score</span>
                <span className="font-medium text-white">{team1Score}</span>
              </div>
              
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Bags</span>
                <div className="text-yellow-300 font-medium flex items-center">
                  <img src="/bag.svg" width={12} height={12} alt="Bags" className="mr-1" priority={true} />
                  {team1Bags}
                </div>
              </div>
              
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Bid</span>
                <span className="font-medium text-white">{team1Bid}</span>
              </div>
              
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Tricks</span>
                <span className="font-medium text-white">{team1Tricks}</span>
              </div>
              
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Nil Bids</span>
                <span className="font-medium text-white">{team1NilBids}</span>
              </div>
              
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Made Nils</span>
                <span className="font-medium text-white">{team1MadeNils}</span>
              </div>
            </div>
          </div>
          
          {/* Team 2 (Blue) */}
          <div className="bg-gray-800/50 backdrop-blur rounded-lg p-2 border border-white/5">
            <div className="flex items-center mb-1">
              <div className="bg-blue-500 rounded-full w-2 h-2 mr-1"></div>
              <h3 className="text-base font-semibold text-white">Team 2</h3>
            </div>
            
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Hand Score</span>
                <span className="font-medium text-white">{team2HandScore}</span>
              </div>
              
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Total Score</span>
                <span className="font-medium text-white">{team2Score}</span>
              </div>
              
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Bags</span>
                <div className="text-yellow-300 font-medium flex items-center">
                  <img src="/bag.svg" width={12} height={12} alt="Bags" className="mr-1" priority={true} />
                  {team2Bags}
                </div>
              </div>
              
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Bid</span>
                <span className="font-medium text-white">{team2Bid}</span>
              </div>
              
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Tricks</span>
                <span className="font-medium text-white">{team2Tricks}</span>
              </div>
              
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Nil Bids</span>
                <span className="font-medium text-white">{team2NilBids}</span>
              </div>
              
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Made Nils</span>
                <span className="font-medium text-white">{team2MadeNils}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-4 flex justify-center">
          <button 
            onClick={onClose}
            className="px-4 py-1.5 text-sm bg-gradient-to-r from-blue-600 to-blue-800 text-white font-medium rounded shadow hover:from-blue-700 hover:to-blue-900 transition-all"
          >
            Next Hand
          </button>
        </div>
      </div>
    </div>
  );
} 