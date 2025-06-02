// Remove Next.js-specific imports
// import Image from 'next/image';

// Remove unused imports
// import { calculateHandScore, isGameOver } from '../../lib/scoring';
// import { Player, HandSummary, TeamScore } from '../types/game';

// Remove unused variables
// const team1HandScore = handScores?.team1Score?.score || 0;
// const team2HandScore = handScores?.team2Score?.score || 0;
// const team1Bid = handScores?.team1Score?.bid || 0;
// const team2Bid = handScores?.team2Score?.bid || 0;
// const team1Tricks = handScores?.team1Score?.tricks || 0;
// const team2Tricks = handScores?.team2Score?.tricks || 0;
// const team1NilBids = handScores?.team1Score?.nilBids || 0;
// const team2NilBids = handScores?.team2Score?.nilBids || 0;
// const team1MadeNils = handScores?.team1Score?.madeNils || 0;
// const team2MadeNils = handScores?.team2Score?.madeNils || 0;

import { useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { isGameOver } from '../../lib/scoring';
import type { HandSummary } from '../../types/game';
import WinnerModal from './WinnerModal';
import LoserModal from './LoserModal';
import { useEffect } from 'react';

interface HandSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  handSummary: HandSummary;
  onNextHand: () => void;
  onNewGame: () => void;
}

export default function HandSummaryModal({
  isOpen,
  onClose,
  handSummary,
  onNextHand,
  onNewGame
}: HandSummaryModalProps) {
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [showLoserModal, setShowLoserModal] = useState(false);

  // Use total scores for game over check
  const team1Score = handSummary?.team1Score || 0;
  const team2Score = handSummary?.team2Score || 0;

  // Check if game is over using total scores
  const { isOver: gameIsOver, winner } = isGameOver(team1Score, team2Score, -250, 500);

  // Call onNextHand if game is over
  useEffect(() => {
    if (gameIsOver && winner) {
      onNextHand();
      
      // Show appropriate modal based on winner
      if (winner === 1) {
        setShowWinnerModal(true);
      } else {
        setShowLoserModal(true);
      }
    }
  }, [gameIsOver, winner, onNextHand]);

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
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    Hand Summary
                  </Dialog.Title>
                  <div className="mt-2">
                    <p className="text-sm text-gray-500">
                      Team 1 Score: {team1Score}
                    </p>
                    <p className="text-sm text-gray-500">
                      Team 2 Score: {team2Score}
                    </p>
                  </div>

                  <div className="mt-4">
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-md border border-transparent bg-blue-100 px-4 py-2 text-sm font-medium text-blue-900 hover:bg-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                      onClick={onNextHand}
                    >
                      Next Hand
                    </button>
                    <button
                      type="button"
                      className="ml-3 inline-flex justify-center rounded-md border border-transparent bg-red-100 px-4 py-2 text-sm font-medium text-red-900 hover:bg-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                      onClick={onNewGame}
                    >
                      New Game
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      <WinnerModal
        isOpen={showWinnerModal}
        onClose={() => setShowWinnerModal(false)}
        team1Score={team1Score}
        team2Score={team2Score}
        winningTeam={1}
        onPlayAgain={onNewGame}
      />
      <LoserModal
        isOpen={showLoserModal}
        onClose={() => setShowLoserModal(false)}
        team1Score={team1Score}
        team2Score={team2Score}
        winningTeam={2}
        onPlayAgain={onNewGame}
      />
    </>
  );
} 