// Modal management component for GameTable
// Handles all modals and overlays

import React from 'react';
import type { GameState, Player, Bot } from "../../../types/game";
import HandSummaryModal from '../../../features/game/components/HandSummaryModal';
import TrickHistoryModal from '../../../components/modals/TrickHistoryModal';
import SeatReplacementModal from '../../../features/game/components/SeatReplacementModal';
import SoloWinnerModal from '../../../features/game/components/SoloWinnerModal';
import WinnerModal from '../../../features/game/components/WinnerModal';
import PlayerStatsModal from '../../../components/modals/PlayerStatsModal';
import { getUserTeam } from '../../../features/game/utils/gameUtils';
import { isGameOver } from '../../../features/game/services/lib/gameRules';

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
  onStartWithBotsFromWarning: () => void;
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-xl border border-white/10 bg-slate-950/95 p-6 shadow-lobby backdrop-blur-xl">
        <div>
          {/* Header with inline icon and title */}
          <div className="mb-4 flex items-center justify-center">
            <svg className="mr-2 h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-2xl font-bold text-white">
              Empty Seats Detected
            </h3>
          </div>
          {/* Message - center aligned */}
          <div className="mb-6 text-center">
            <p className="mb-2 text-lg font-semibold text-slate-200">
              Coin games require 4 human players.<br />You have {emptySeats} empty seat{emptySeats !== 1 ? 's' : ''}.
            </p>
            <p className="text-slate-400">
              If you continue, the game will start with bot players in all empty seats and the game will not be rated.
            </p>
          </div>
          {/* Buttons */}
          <div className="flex justify-center gap-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-slate-200 transition-colors hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              onClick={onPlayWithBots}
              className="rounded-lg bg-gradient-to-r from-amber-400 to-amber-600 px-4 py-2 font-semibold text-slate-900 shadow-md shadow-amber-950/30 transition hover:from-amber-300 hover:to-amber-500"
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-xl border border-white/10 bg-slate-950/95 p-6 shadow-lobby backdrop-blur-xl">
        <div>
          {/* Header with inline icon and title */}
          <div className="mb-4 flex items-center justify-center">
            <svg className="mr-2 h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-2xl font-bold text-white">
              Bot Players Detected
            </h3>
          </div>
          {/* Message - center aligned */}
          <div className="mb-6 text-center">
            <p className="mb-2 text-lg font-semibold text-slate-200">
              Coin games require 4 human players.<br />You have {botCount} bot player{botCount !== 1 ? 's' : ''}.
            </p>
            <p className="text-slate-400">
              If you continue, the game will start but will not be rated.
            </p>
          </div>
          {/* Buttons */}
          <div className="flex justify-center gap-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-slate-200 transition-colors hover:bg-white/10"
            >
              Cancel
            </button>
            {!isStarting && (
              <button
                onClick={onStartWithBots}
                className="rounded-lg bg-gradient-to-r from-amber-400 to-amber-600 px-4 py-2 font-semibold text-slate-900 shadow-md shadow-amber-950/30 transition hover:from-amber-300 hover:to-amber-500"
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
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="mx-4 max-w-sm rounded-xl border border-white/10 bg-slate-950/95 p-6 shadow-lobby backdrop-blur-xl">
        <h3 className="mb-4 text-lg font-bold text-white">Leave Table?</h3>
        <p className="mb-6 text-slate-400">
          Are you sure you want to leave this table? You will lose your seat and any ongoing game.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-slate-200 transition hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg border border-red-500/40 bg-red-950/50 px-4 py-2 text-red-100 transition hover:bg-red-900/60"
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
    onStartWithBotsFromWarning,
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
        onPlayWithBots={() => {
          console.log('[MODAL] Calling onStartWithBots from empty seats modal');
          onStartWithBots();
        }}
      />

      {/* Bot Warning Modal */}
      <BotWarningModal
        isOpen={showBotWarning}
        botCount={botCount}
        isStarting={isStarting}
        onClose={onCloseBotWarning}
        onStartWithBots={onStartWithBotsFromWarning}
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
          userPlayerIndex={gameState.players?.findIndex(p => p && (p.id === user?.id || p.userId === user?.id))}
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
            if (!gameState.buyIn || !gameState.rated) return 0;
            const buyIn = gameState.buyIn;
            const userTeam = getUserTeam(gameState, user?.id || '');
            const winningTeam = (finalScores?.team1Score ?? gameState.team1TotalScore ?? 0) > (finalScores?.team2Score ?? gameState.team2TotalScore ?? 0) ? 1 : 2;
            const isUserWinner = userTeam === winningTeam;
            return isUserWinner ? Math.floor(buyIn * 1.8) : 0;
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
