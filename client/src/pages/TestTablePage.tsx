import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import GameTable from '../table-ui/game/GameTable';
import type { GameState } from '../types/game';

import { socketApi } from '../table-ui/lib/socketApi';
import { api } from '@/lib/api';
import LandscapePrompt from '../LandscapePrompt';
import TableInactivityModal from '../components/modals/TableInactivityModal';

// Mock game data for development
const createMockGame = (): GameState => ({
  id: 'test-game-123',
  status: 'PLAYING',
  players: [
    {
      id: 'user-1',
      username: 'TestPlayer1',
      avatar: '/default-pfp.jpg',
      seat: 0,
      position: 0,
      isHost: true,
      isReady: true,
      coins: 10000,
      stats: {
        gamesPlayed: 25,
        gamesWon: 15,
        winRate: 60,
        totalCoins: 50000
      }
    },
    {
      id: 'user-2',
      username: 'TestPlayer2',
      avatar: '/default-pfp.jpg',
      seat: 1,
      position: 1,
      isHost: false,
      isReady: true,
      coins: 8000,
      stats: {
        gamesPlayed: 30,
        gamesWon: 18,
        winRate: 60,
        totalCoins: 45000
      }
    },
    {
      id: 'user-3',
      username: 'TestPlayer3',
      avatar: '/default-pfp.jpg',
      seat: 2,
      position: 2,
      isHost: false,
      isReady: true,
      coins: 12000,
      stats: {
        gamesPlayed: 20,
        gamesWon: 12,
        winRate: 60,
        totalCoins: 60000
      }
    },
    {
      id: 'user-4',
      username: 'TestPlayer4',
      avatar: '/default-pfp.jpg',
      seat: 3,
      position: 3,
      isHost: false,
      isReady: true,
      coins: 15000,
      stats: {
        gamesPlayed: 35,
        gamesWon: 22,
        winRate: 63,
        totalCoins: 75000
      }
    }
  ],
  currentPlayer: 'user-1',
  hands: [
    [
      { rank: 'A', suit: 'S', value: 14 },
      { rank: 'K', suit: 'S', value: 13 },
      { rank: 'Q', suit: 'S', value: 12 },
      { rank: 'J', suit: 'S', value: 11 },
      { rank: '10', suit: 'S', value: 10 },
      { rank: '9', suit: 'S', value: 9 },
      { rank: '8', suit: 'S', value: 8 },
      { rank: '7', suit: 'S', value: 7 },
      { rank: '6', suit: 'S', value: 6 },
      { rank: '5', suit: 'S', value: 5 },
      { rank: '4', suit: 'S', value: 4 },
      { rank: '3', suit: 'S', value: 3 },
      { rank: '2', suit: 'S', value: 2 }
    ],
    [
      { rank: 'A', suit: 'H', value: 14 },
      { rank: 'K', suit: 'H', value: 13 },
      { rank: 'Q', suit: 'H', value: 12 },
      { rank: 'J', suit: 'H', value: 11 },
      { rank: '10', suit: 'H', value: 10 },
      { rank: '9', suit: 'H', value: 9 },
      { rank: '8', suit: 'H', value: 8 },
      { rank: '7', suit: 'H', value: 7 },
      { rank: '6', suit: 'H', value: 6 },
      { rank: '5', suit: 'H', value: 5 },
      { rank: '4', suit: 'H', value: 4 },
      { rank: '3', suit: 'H', value: 3 },
      { rank: '2', suit: 'H', value: 2 }
    ],
    [
      { rank: 'A', suit: 'D', value: 14 },
      { rank: 'K', suit: 'D', value: 13 },
      { rank: 'Q', suit: 'D', value: 12 },
      { rank: 'J', suit: 'D', value: 11 },
      { rank: '10', suit: 'D', value: 10 },
      { rank: '9', suit: 'D', value: 9 },
      { rank: '8', suit: 'D', value: 8 },
      { rank: '7', suit: 'D', value: 7 },
      { rank: '6', suit: 'D', value: 6 },
      { rank: '5', suit: 'D', value: 5 },
      { rank: '4', suit: 'D', value: 4 },
      { rank: '3', suit: 'D', value: 3 },
      { rank: '2', suit: 'D', value: 2 }
    ],
    [
      { rank: 'A', suit: 'C', value: 14 },
      { rank: 'K', suit: 'C', value: 13 },
      { rank: 'Q', suit: 'C', value: 12 },
      { rank: 'J', suit: 'C', value: 11 },
      { rank: '10', suit: 'C', value: 10 },
      { rank: '9', suit: 'C', value: 9 },
      { rank: '8', suit: 'C', value: 8 },
      { rank: '7', suit: 'C', value: 7 },
      { rank: '6', suit: 'C', value: 6 },
      { rank: '5', suit: 'C', value: 5 },
      { rank: '4', suit: 'C', value: 4 },
      { rank: '3', suit: 'C', value: 3 },
      { rank: '2', suit: 'C', value: 2 }
    ]
  ],
  bidding: {
    currentBidderIndex: 0,
    currentPlayer: 'user-1',
    bids: [3, 2, 4, 1],
    round: 1
  },
  play: {
    currentPlayer: 'user-1',
    currentPlayerIndex: 0,
    currentTrick: [
      { rank: 'A', suit: 'H', value: 14, playerIndex: 1 },
      { rank: 'K', suit: 'H', value: 13, playerIndex: 2 },
      { rank: 'Q', suit: 'H', value: 12, playerIndex: 3 }
    ],
    trickNumber: 1,
    spadesBroken: false
  },
  tricks: [],
  scores: [0, 0, 0, 0],
  bids: [3, 2, 4, 1],
  tricksWon: [0, 0, 0, 0],
  specialRules: {
    screamer: false,
    nil: true,
    blindNil: true
  },
  gameSettings: {
    maxScore: 500,
    coinBet: 1000
  }
});

export default function TestTablePage() {
  console.log('🚨🚨🚨 [TEST TABLE] TestTablePage component loaded at:', new Date().toISOString());
  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [game, setGame] = useState<GameState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Modal state
  const [showStartWarning, setShowStartWarning] = useState(false);
  const [showBotWarning, setShowBotWarning] = useState(false);
  const [emptySeats, setEmptySeats] = useState(0);
  const [botCount, setBotCount] = useState(0);
  const [showInactivityModal, setShowInactivityModal] = useState(false);

  // Check if device is mobile or tablet
  const isMobileOrTablet = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           window.innerWidth <= 1024;
  };

  // Helper function to check if a player is a bot
  const isBot = (p: any): p is any => p && p.type === 'bot';

  // Helper function to count empty seats and bot players
  const updateModalState = (gameState: GameState) => {
    const emptySeatsCount = (gameState.players || []).filter(p => !p).length;
    const botPlayersCount = (gameState.players || []).filter(p => p && isBot(p)).length;
    setEmptySeats(emptySeatsCount);
    setBotCount(botPlayersCount);
  };

  // Request full-screen mode (only for game table)
  const requestFullScreen = async () => {
    if (isMobileOrTablet()) {
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        } else if ((document.documentElement as any).webkitRequestFullscreen) {
          await (document.documentElement as any).webkitRequestFullscreen();
        } else if ((document.documentElement as any).msRequestFullscreen) {
          await (document.documentElement as any).msRequestFullscreen();
        }
        setIsFullScreen(true);
      } catch (error) {
        console.log('Full-screen request failed:', error);
      }
    }
  };

  // Exit full-screen mode
  const exitFullScreen = async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen();
      }
      setIsFullScreen(false);
    } catch (error) {
      console.log('Exit full-screen failed:', error);
    }
  };

  // Listen for full-screen changes
  useEffect(() => {
    const handleFullScreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullScreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullScreenChange);
    document.addEventListener('msfullscreenchange', handleFullScreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullScreenChange);
      document.removeEventListener('msfullscreenchange', handleFullScreenChange);
    };
  }, []);

  // Initialize with mock data
  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    console.log('[TEST TABLE] Initializing with mock data');
    
    // Create mock game data
    const mockGame = createMockGame();
    
    // Update the first player to be the current user
    if (mockGame.players[0]) {
      mockGame.players[0] = {
        ...mockGame.players[0],
        id: user.id,
        username: user.username,
        avatar: user.avatar
      };
    }
    
    setGame(mockGame);
    updateModalState(mockGame);
    setIsLoading(false);

    // Request full-screen on mobile/tablet after game loads
    if (isMobileOrTablet()) {
      setTimeout(() => {
        requestFullScreen();
      }, 1000); // Small delay to ensure game is loaded
    }

    return () => {
      // Exit full-screen when leaving the page
      if (isFullScreen) {
        exitFullScreen();
      }
    };
  }, [user, navigate]);

  const playCardSound = () => {
    try {
      // Try to use preloaded audio first
      if ((window as any).cardAudio) {
        (window as any).cardAudio.currentTime = 0;
        (window as any).cardAudio.play().catch((err: any) => console.log('Card audio play failed:', err));
      } else {
        // Fallback to creating new audio
        const audio = new Audio('/sounds/card.wav');
        audio.volume = 0.3;
        audio.play().catch((err: any) => console.log('Card audio play failed:', err));
      }
    } catch (error) {
      console.log('Card audio not supported or failed to load:', error);
    }
  };

  const handleJoinGame = async () => {
    console.log('[TEST TABLE] Join game called (mock)');
    // In test mode, we don't actually join a game
  };

  const handleLeaveTable = async () => {
    console.log('[TEST TABLE] Leave table called (mock)');
    navigate('/');
  };

  const handleStartGame = async () => {
    console.log('[TEST TABLE] Start game called (mock)');
    // In test mode, we don't actually start a game
  };

  // Modal handlers
  const handleCloseStartWarning = () => {
    setShowStartWarning(false);
  };

  const handleCloseBotWarning = () => {
    setShowBotWarning(false);
  };

  const handlePlayWithBots = async () => {
    console.log('[TEST TABLE] Play with bots called (mock)');
    setShowStartWarning(false);
  };

  const handleStartWithBots = async () => {
    console.log('[TEST TABLE] Start with bots called (mock)');
    setShowBotWarning(false);
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

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
        {/* Full-screen toggle button for mobile/tablet */}
        {isMobileOrTablet() && (
          <button
            onClick={isFullScreen ? exitFullScreen : requestFullScreen}
            className="fixed top-4 right-4 z-50 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg shadow-lg transition-colors"
            title={isFullScreen ? "Exit Full Screen" : "Enter Full Screen"}
          >
            {isFullScreen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            )}
          </button>
        )}
        
        {/* Test mode indicator */}
        <div className="fixed top-4 left-4 z-50 bg-yellow-500 text-black px-3 py-1 rounded-lg font-semibold shadow-lg">
          TEST MODE
        </div>
        
        <GameTable
          game={game}
          joinGame={handleJoinGame}
          onLeaveTable={handleLeaveTable}
          startGame={handleStartGame}
          user={user}
          showStartWarning={showStartWarning}
          showBotWarning={showBotWarning}
          onCloseStartWarning={handleCloseStartWarning}
          onCloseBotWarning={handleCloseBotWarning}
          emptySeats={emptySeats}
          botCount={botCount}
          isSpectator={false}
          isTestMode={true}
        />
      </div>

      {/* Mobile Modals - rendered using portal at document body level */}
      {showStartWarning && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] sm:hidden">
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
                  onClick={handleCloseStartWarning}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePlayWithBots}
                  className="px-4 py-2 bg-yellow-500 text-black font-semibold rounded-lg hover:bg-yellow-600 transition-colors"
                >
                  Play with Bots
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showBotWarning && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] sm:hidden">
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
                  onClick={handleCloseBotWarning}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartWithBots}
                  className="px-4 py-2 bg-yellow-500 text-black font-semibold rounded-lg hover:bg-yellow-600 transition-colors"
                >
                  Start Game
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Inactivity Modal */}
      <TableInactivityModal
        isOpen={showInactivityModal}
        onClose={() => {
          setShowInactivityModal(false);
          navigate('/'); // Redirect to lobby after closing modal
        }}
      />
    </>
  );
} 