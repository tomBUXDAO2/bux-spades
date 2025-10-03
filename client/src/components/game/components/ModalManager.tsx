// Modal management component for GameTable
// Handles all modals and overlays

import React from 'react';
import type { GameState, Player, Bot } from "../../types/game""";
import HandSummaryModal from '@/features/game/components/HandSummaryModal';
import TrickHistoryModal from '@/components/modals/TrickHistoryModal';
import SeatReplacementModal from '@/features/game/components/SeatReplacementModal';
import SoloWinnerModal from '@/features/game/components/SoloWinnerModal';
import WinnerModal from '@/features/game/components/WinnerModal';
import PlayerStatsModal from '@/components/modals/PlayerStatsModal';
import { getUserTeam } from '@/features/game/utils/gameUtils';
import { isGameOver } from '@/features/game/services/lib/gameRules';

interface ModalManagerProps {
  // Game state
  gameState: GameState;
  user: any;
  
  // Modal states
  showHandSummary: boolean;
  showTrickHistory: boolean;
  showPlayerStats: boolean;
  showLeaveConfirmation: boolean;
  showWinner: boolean;
  showLoser: boolean;
  showStartWarningModal: boolean;
  showBotWarning: boolean;
  
  // Hand summary data
  handSummaryData: any;
  
  // Final scores
  finalScores: { team1Score: number; team2Score: number } | null;
  finalPlayerScores: number[] | null;
  
  // Seat replacement
  seatReplacement: {
    isOpen: boolean;
    seatIndex: number;
    expiresAt: number;
  };
  
  // Props
  emptySeats: number;
  botCount: number;
  isStarting: boolean;
  selectedPlayer: any;
  
  // Handlers
  onCloseHandSummary: () => void;
  onCloseTrickHistory: () => void;
  onClosePlayerStats: () => void;
  onCloseLeaveConfirmation: () => void;
  onCloseWinner: () => void;
  onCloseLoser: () => void;
  onCloseStartWarning: () => void;
  onCloseBotWarning: () => void;
  onCloseSeatReplacement: () => void;
  onHandSummaryContinue: () => void;
  onPlayAgain: () => void;
  onLeaveTable: () => void;
  onCancelLeave: () => void;
  onConfirmLeave: () => void;
  onStartWithBots: () => void;
  onPlayWithBots: () => void;
  onFillSeatWithBot: () => void;
  onTimerExpire: () => void;
  
  // Utility functions
  isPlayer: (p: Player | Bot | null) => p is Player;
  isBot: (p: Player | Bot | null) => p is Bot;
}

// Start warning modal
const StartWarningModal: React.FC<{
  isOpen: boolean;
  emptySeats: number;
  onClose: () => void;
  onPlayWithBots: () => void;
}> = ({ isOpen, emptySeats, onClose, onPlayWithBots }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl border border-white/20">
        <div>
          {/* Header with inline icon and title */}
          <div className="flex items-center justify-center mb-4">
            <svg className="h-6 w-6 text-yellow-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-2xl font-bold text-white">
              Empty Seats Detected
            </h3>
          </div>
          {/* Message - center aligned */}
          <div className="text-center mb-6">
            <p className="text-lg text-gray-200 mb-2 font-semibold">
              Coin games require 4 human players.<br />You have {emptySeats} empty seat{emptySeats !== 1 ? 's' : ''}.
            </p>
            <p className="text-gray-300">
              If you continue, the game will start with bot players in all empty seats and the game will not be rated.
            </p>
          </div>
          {/* Buttons */}
          <div className="flex gap-3 justify-center">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onPlayWithBots}
              className="px-4 py-2 bg-yellow-500 text-black font-semibold rounded-lg hover:bg-yellow-600 transition-colors"
            >
              Play with Bots
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Bot warning modal
const BotWarningModal: React.FC<{
  isOpen: boolean;
  botCount: number;
  isStarting: boolean;
  onClose: () => void;
  onStartWithBots: () => void;
}> = ({ isOpen, botCount, isStarting, onClose, onStartWithBots }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl border border-white/20">
        <div>
          {/* Header with inline icon and title */}
          <div className="flex items-center justify-center mb-4">
            <svg className="h-6 w-6 text-yellow-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-2xl font-bold text-white">
              Bot Players Detected
            </h3>
          </div>
          {/* Message - center aligned */}
          <div className="text-center mb-6">
            <p className="text-lg text-gray-200 mb-2 font-semibold">
              Coin games require 4 human players.<br />You have {botCount} bot player{botCount !== 1 ? 's' : ''}.
            </p>
            <p className="text-gray-300">
              If you continue, the game will start but will not be rated.
            </p>
          </div>
          {/* Buttons */}
          <div className="flex gap-3 justify-center">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            {!isStarting && (
              <button
                onClick={onStartWithBots}
                className="px-4 py-2 bg-yellow-500 text-black font-semibold rounded-lg hover:bg-yellow-600 transition-colors"
              >
                Start Game
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Leave table confirmation modal
const LeaveTableModal: React.FC<{
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ isOpen, onCancel, onConfirm }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 max-w-sm mx-4">
        <h3 className="text-white text-lg font-bold mb-4">Leave Table?</h3>
        <p className="text-gray-300 mb-6">
          Are you sure you want to leave this table? You will lose your seat and any ongoing game.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
          >
            Leave Table
          </button>
        </div>
      </div>
    </div>
  );
};

// Main modal manager component
export const ModalManager: React.FC<ModalManagerProps> = (props) => {
  const {
    gameState,
    user,
    showHandSummary,
    showTrickHistory,
    showPlayerStats,
    showLeaveConfirmation,
    showWinner,
    showLoser,
    showStartWarningModal,
    showBotWarning,
    handSummaryData,
    finalScores,
    finalPlayerScores,
    seatReplacement,
    emptySeats,
    botCount,
    isStarting,
    selectedPlayer,
    onCloseHandSummary,
    onCloseTrickHistory,
    onClosePlayerStats,
    onCloseLeaveConfirmation,
    onCloseWinner,
    onCloseLoser,
    onCloseStartWarning,
    onCloseBotWarning,
    onCloseSeatReplacement,
    onHandSummaryContinue,
    onPlayAgain,
    onLeaveTable,
    onCancelLeave,
    onConfirmLeave,
    onStartWithBots,
    onPlayWithBots,
    onFillSeatWithBot,
    onTimerExpire,
    isPlayer,
    isBot
  } = props;

  return (
    <>
      {/* Hand Summary Modal */}
      {showHandSummary && !isGameOver(gameState) && (
        <HandSummaryModal
          isOpen={showHandSummary}
          onClose={onCloseHandSummary}
          gameState={gameState}
          handSummaryData={handSummaryData}
          onNextHand={onHandSummaryContinue}
        />
      )}

      {/* Trick History Modal */}
      <TrickHistoryModal
        isOpen={showTrickHistory}
        onClose={onCloseTrickHistory}
        gameId={gameState.id}
        players={gameState.players}
        gameState={gameState}
      />

      {/* Start Warning Modal */}
      <StartWarningModal
        isOpen={showStartWarningModal}
        emptySeats={emptySeats}
        onClose={onCloseStartWarning}
        onPlayWithBots={onPlayWithBots}
      />

      {/* Bot Warning Modal */}
      <BotWarningModal
        isOpen={showBotWarning}
        botCount={botCount}
        isStarting={isStarting}
        onClose={onCloseBotWarning}
        onStartWithBots={onStartWithBots}
      />

      {/* Seat Replacement Modal */}
      <SeatReplacementModal
        isOpen={seatReplacement.isOpen}
        onClose={onCloseSeatReplacement}
        seatIndex={seatReplacement.seatIndex}
        expiresAt={seatReplacement.expiresAt}
        onFillSeat={onFillSeatWithBot}
      />

      {/* Solo Winner Modal */}
      {gameState.gameMode === 'SOLO' && (
        <SoloWinnerModal
          isOpen={showWinner || showLoser}
          onClose={() => {
            onCloseWinner();
            onCloseLoser();
          }}
          playerScores={finalPlayerScores || gameState.playerScores || [0, 0, 0, 0]}
          winningPlayer={gameState.winningPlayer || 0}
          onPlayAgain={onPlayAgain}
          userPlayerIndex={gameState.players?.findIndex(p => p && p.id === user?.id)}
          humanPlayerCount={(gameState.players || []).filter(p => p && !isBot(p)).length}
          onTimerExpire={onTimerExpire}
          buyIn={gameState.buyIn || (gameState.rules as any)?.coinAmount || 0}
          onLeaveTable={onLeaveTable}
          players={gameState.players}
          isRated={(gameState.players || []).filter(p => p && !isBot(p)).length === 4}
        />
      )}

      {/* Winner Modal - for partners games only */}
      {gameState.gameMode !== 'SOLO' && (
        <WinnerModal
          isOpen={showWinner}
          onClose={onCloseWinner}
          team1Score={finalScores?.team1Score ?? gameState.team1TotalScore ?? 0}
          team2Score={finalScores?.team2Score ?? gameState.team2TotalScore ?? 0}
          winningTeam={(finalScores?.team1Score ?? gameState.team1TotalScore ?? 0) > (finalScores?.team2Score ?? gameState.team2TotalScore ?? 0) ? 1 : 2}
          onPlayAgain={onPlayAgain}
          userTeam={getUserTeam(gameState, user?.id || '')}
          isCoinGame={(gameState.players || []).filter(p => p && !isBot(p)).length === 4}
          coinsWon={(() => {
            if (!gameState.buyIn) return 0;
            const buyIn = gameState.buyIn;
            const prizePot = buyIn * 4 * 0.9; // 90% of total buy-ins
            return prizePot / 2; // Each winning team member gets half the pot
          })()}
          humanPlayerCount={(gameState.players || []).filter(p => p && !isBot(p)).length}
          onTimerExpire={onTimerExpire}
          onLeaveTable={onLeaveTable}
          players={gameState.players}
        />
      )}

      {/* Loser Modal - for partners games only */}
      {gameState.gameMode !== 'SOLO' && (
        <WinnerModal
          isOpen={showLoser}
          onClose={onCloseLoser}
          team1Score={finalScores?.team1Score ?? gameState.team1TotalScore ?? 0}
          team2Score={finalScores?.team2Score ?? gameState.team2TotalScore ?? 0}
          winningTeam={(finalScores?.team1Score ?? gameState.team1TotalScore ?? 0) > (finalScores?.team2Score ?? gameState.team2TotalScore ?? 0) ? 1 : 2}
          onPlayAgain={onPlayAgain}
          userTeam={getUserTeam(gameState, user?.id || '')}
          isCoinGame={(gameState.players || []).filter(p => p && !isBot(p)).length === 4}
          coinsWon={0} // Losers get 0 coins
          humanPlayerCount={(gameState.players || []).filter(p => p && !isBot(p)).length}
          onTimerExpire={onTimerExpire}
          onLeaveTable={onLeaveTable}
          players={gameState.players}
        />
      )}

      {/* Player Stats Modal */}
      <PlayerStatsModal
        isOpen={showPlayerStats}
        onClose={onClosePlayerStats}
        player={selectedPlayer}
      />

      {/* Leave Table Confirmation Modal */}
      <LeaveTableModal
        isOpen={showLeaveConfirmation}
        onCancel={onCancelLeave}
        onConfirm={onConfirmLeave}
      />
    </>
  );
};
