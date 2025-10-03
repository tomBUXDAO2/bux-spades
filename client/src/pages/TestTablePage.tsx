import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuth } from '@/features/auth/AuthContext';
import GameTable from '@/features/game/components/GameTable';
import type { GameState } from "../types/game";
import { createMockGame } from './TestTablePage/components/MockGameData';
import { isMobileOrTablet, isBot } from './TestTablePage/components/DeviceDetection';
import { requestFullScreen, exitFullScreen } from './TestTablePage/components/FullScreenManager';
import { TestModeIndicator } from './TestTablePage/components/TestModeIndicator';
import { FullScreenToggle } from './TestTablePage/components/FullScreenToggle';
import LandscapePrompt from '../LandscapePrompt';
import TableInactivityModal from '../components/modals/TableInactivityModal';

export default function TestTablePageModular() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [game, setGame] = useState<GameState>(createMockGame());
  const [showStartWarning, setShowStartWarning] = useState(false);
  const [showBotWarning, setShowBotWarning] = useState(false);
  const [emptySeats, setEmptySeats] = useState(0);
  const [botCount, setBotCount] = useState(0);

  // Modal state
  const [showInactivityModal, setShowInactivityModal] = useState(false);

  // Helper function to count empty seats and bot players
  const updateModalState = (gameState: GameState) => {
    const emptySeatsCount = (gameState.players || []).filter((p: any) => !p).length;
    const botPlayersCount = (gameState.players || []).filter((p: any) => p && isBot(p)).length;
    setEmptySeats(emptySeatsCount);
    setBotCount(botPlayersCount);
  };

  // Handle game state updates
  const handleGameStateUpdate = (newGameState: GameState) => {
    setGame(newGameState);
    updateModalState(newGameState);
  };

  // Handle joining game
  const handleJoinGame = (gameId: string, userId: string, options?: any): void => {
    console.log('Join game:', gameId, userId, options);
    // In test mode, we don't actually join a real game
  };

  // Handle leaving table
  const handleLeaveTable = () => {
    navigate('/');
  };

  // Handle starting game
  const handleStartGame = async (gameId: string, userId?: string): Promise<void> => {
    console.log('Start game:', gameId, userId);
    // In test mode, we don't actually start a real game
  };

  // Handle starting game from button click
  const handleStartGameClick = () => {
    handleStartGame(game.id, user?.id);
  };

  // Handle closing start warning
  const handleCloseStartWarning = () => {
    setShowStartWarning(false);
  };

  // Handle closing bot warning
  const handleCloseBotWarning = () => {
    setShowBotWarning(false);
  };

  // Handle inactivity modal
  const handleInactivityModalClose = () => {
    setShowInactivityModal(false);
  };

  // Handle inactivity modal confirm
  const handleInactivityModalConfirm = () => {
    setShowInactivityModal(false);
    navigate('/');
  };

  // Initialize game state
  useEffect(() => {
    updateModalState(game);
  }, [game]);

  // Handle full-screen changes
  useEffect(() => {
    const handleFullScreenChange = () => {
      if (document.fullscreenElement) {
        console.log('Entered full-screen mode');
      } else {
        console.log('Exited full-screen mode');
      }
    };

    document.addEventListener('fullscreenchange', handleFullScreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullScreenChange);
  }, []);

  if (!game) {
    return <div>Game not found</div>;
  }

  return (
    <>
      <style>
        {`
          /* Test table specific styles - minimal fixes */
          .test-table-page .fixed.inset-0 {
            height: 100vh !important;
          }
        `}
      </style>
      
      <div className="table-page relative test-table-page">
        <LandscapePrompt />
        
        <FullScreenToggle isVisible={true} />
        <TestModeIndicator isVisible={true} />
        
        <GameTable
          game={game}
          joinGame={handleJoinGame}
          onLeaveTable={handleLeaveTable}
          startGame={handleStartGame}
          user={user || undefined}
          showStartWarning={showStartWarning}
          showBotWarning={showBotWarning}
          onCloseStartWarning={handleCloseStartWarning}
          onCloseBotWarning={handleCloseBotWarning}
          emptySeats={emptySeats}
          botCount={botCount}
          isSpectator={false}
          testAnimatingTrick={true}
          testTrickWinner={1}
        />
      </div>

      {/* Mobile Modals - rendered using portal at document body level */}
      {showStartWarning && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 max-w-sm mx-4">
            <h3 className="text-white font-bold text-lg mb-4">Start Game Warning</h3>
            <p className="text-slate-300 mb-6">
              Are you sure you want to start the game with empty seats?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleCloseStartWarning}
                className="flex-1 bg-slate-600 hover:bg-slate-700 text-white py-2 px-4 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStartGameClick}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded transition-colors"
              >
                Start Game
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showBotWarning && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 max-w-sm mx-4">
            <h3 className="text-white font-bold text-lg mb-4">Bot Warning</h3>
            <p className="text-slate-300 mb-6">
              This game contains {botCount} bot player(s). Are you sure you want to continue?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleCloseBotWarning}
                className="flex-1 bg-slate-600 hover:bg-slate-700 text-white py-2 px-4 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStartGameClick}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showInactivityModal && createPortal(
        <TableInactivityModal
          isOpen={showInactivityModal}
          onClose={handleInactivityModalClose}
        />,
        document.body
      )}
    </>
  );
}
