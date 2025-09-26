import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import GameTable from '../table-ui/game/GameTable';
import type { GameState, Card, Rank, Suit } from '../types/game';

import LandscapePrompt from '../LandscapePrompt';
import TableInactivityModal from '../components/modals/TableInactivityModal';

// Mock game data for development
const createMockGame = (): GameState => {
  // Create the hands array first with realistic mixed card distributions
  const hands = [
    [
      { rank: 'A', suit: '♠' },
      { rank: 'K', suit: '♠' },
      { rank: 'Q', suit: '♠' },
      { rank: 'J', suit: '♠' },
      { rank: '10', suit: '♠' },
      { rank: 'A', suit: '♥' },
      { rank: 'K', suit: '♥' },
      { rank: 'Q', suit: '♥' },
      { rank: 'A', suit: '♦' },
      { rank: 'K', suit: '♦' },
      { rank: 'A', suit: '♣' },
      { rank: 'K', suit: '♣' },
      { rank: 'Q', suit: '♣' }
    ],
    [
      { rank: '9', suit: '♠' },
      { rank: '8', suit: '♠' },
      { rank: '7', suit: '♠' },
      { rank: '6', suit: '♠' },
      { rank: '5', suit: '♠' },
      { rank: 'J', suit: '♥' },
      { rank: '10', suit: '♥' },
      { rank: '9', suit: '♥' },
      { rank: '8', suit: '♥' },
      { rank: 'Q', suit: '♦' },
      { rank: 'J', suit: '♦' },
      { rank: '10', suit: '♦' },
      { rank: 'J', suit: '♣' }
    ],
    [
      { rank: '4', suit: '♠' },
      { rank: '3', suit: '♠' },
      { rank: '2', suit: '♠' },
      { rank: '7', suit: '♥' },
      { rank: '6', suit: '♥' },
      { rank: '5', suit: '♥' },
      { rank: '4', suit: '♥' },
      { rank: '3', suit: '♥' },
      { rank: '2', suit: '♥' },
      { rank: '9', suit: '♦' },
      { rank: '8', suit: '♦' },
      { rank: '7', suit: '♦' },
      { rank: '6', suit: '♦' }
    ],
    [
      { rank: '5', suit: '♦' },
      { rank: '4', suit: '♦' },
      { rank: '3', suit: '♦' },
      { rank: '2', suit: '♦' },
      { rank: '10', suit: '♣' },
      { rank: '9', suit: '♣' },
      { rank: '8', suit: '♣' },
      { rank: '7', suit: '♣' },
      { rank: '6', suit: '♣' },
      { rank: '5', suit: '♣' },
      { rank: '4', suit: '♣' },
      { rank: '3', suit: '♣' },
      { rank: '2', suit: '♣' }
    ]
  ];

  return {
  id: 'test-game-123',
  status: 'PLAYING',
  players: [
    {
      id: 'user-1',
      name: 'TestPlayer1',
      username: 'TestPlayer1',
      avatar: '/default-pfp.jpg',
      position: 0,
      team: 1,
      isDealer: true,
      hand: hands[0] as Card[], // Cast to Card[] type
      bid: 3,
      tricks: 2
    },
    {
      id: 'user-2',
      name: 'TestPlayer2',
      username: 'TestPlayer2',
      avatar: '/default-pfp.jpg',
      position: 1,
      team: 2,
      isDealer: false,
      hand: hands[1] as Card[], // Cast to Card[] type
      bid: 4,
      tricks: 1
    },
    {
      id: 'user-3',
      name: 'TestPlayer3',
      username: 'TestPlayer3',
      avatar: '/default-pfp.jpg',
      position: 2,
      team: 1,
      isDealer: false,
      hand: hands[2] as Card[], // Cast to Card[] type
      bid: 2,
      tricks: 3
    },
    {
      id: 'user-4',
      name: 'TestPlayer4',
      username: 'TestPlayer4',
      avatar: '/default-pfp.jpg',
      position: 3,
      team: 2,
      isDealer: false,
      hand: hands[3] as Card[], // Cast to Card[] type
      bid: 4,
      tricks: 2
    }
  ],
  currentPlayer: 'user-1',
  hands: hands, // Keep the hands array as well for compatibility
  currentTrick: [
    { rank: 'A' as Rank, suit: '♠' as Suit },
    { rank: 'K' as Rank, suit: '♥' as Suit },
    { rank: 'Q' as Rank, suit: '♦' as Suit },
    { rank: 'J' as Rank, suit: '♣' as Suit }
  ],
  completedTricks: [],
  rules: {
    gameType: 'REGULAR',
    allowNil: true,
    allowBlindNil: true,
    numHands: 13,
    coinAmount: 100
  },
  round: 1,
  maxPoints: 500,
  minPoints: 0,
  creatorId: 'user-1',
  bidding: {
    phase: 'COMPLETED',
    bids: {
      'user-1': 3,
      'user-2': 4,
      'user-3': 2,
      'user-4': 4
    },
    totalBid: 13
  },
  play: {
    phase: 'ACTIVE',
    currentTrick: [
      { rank: 'A' as Rank, suit: '♠' as Suit },
      { rank: 'K' as Rank, suit: '♥' as Suit },
      { rank: 'Q' as Rank, suit: '♦' as Suit },
      { rank: 'J' as Rank, suit: '♣' as Suit }
    ],
    trickWinner: 1,
    tricksWon: {
      'user-1': 2,
      'user-2': 1,
      'user-3': 3,
      'user-4': 2
    }
  }
  };
};

export default function TestTablePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [game, setGame] = useState<GameState>(createMockGame());
  const [showStartWarning, setShowStartWarning] = useState(false);
  const [showBotWarning, setShowBotWarning] = useState(false);
  const [emptySeats, setEmptySeats] = useState(0);
  const [botCount, setBotCount] = useState(0);

  // Modal state
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
    } catch (error) {
      console.log('Exit full-screen failed:', error);
    }
  };

  // Listen for full-screen changes
  useEffect(() => {
    const handleFullScreenChange = () => {
      // setIsFullScreen(!!document.fullscreenElement); // This line was removed
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
    
    const mockGame = createMockGame();
    
    // Update the first player to be the current user if available
    if (user && mockGame.players[0]) {
      mockGame.players[0] = {
        ...mockGame.players[0],
        id: user.id,
        name: user.username || 'TestPlayer1',
        username: user.username || 'TestPlayer1',
        avatar: user.avatarUrl || '/default-pfp.jpg'
      };
    }
    
    setGame(mockGame);
    updateModalState(mockGame);

    // Request full-screen on mobile/tablet after game loads
    if (isMobileOrTablet()) {
      setTimeout(() => {
        requestFullScreen();
      }, 1000); // Small delay to ensure game is loaded
    }

    return () => {
      // Exit full-screen when leaving the page
      if (isMobileOrTablet() && document.fullscreenElement) {
        exitFullScreen();
      }
    };
  }, [user, navigate]);

  const handleJoinGame = async () => {
    console.log('Joining test game...');
  };

  const handleLeaveTable = async () => {
    navigate('/');
  };

  const handleStartGame = async () => {
    console.log('Starting test game...');
  };

  // Modal handlers
  const handleCloseStartWarning = () => {
    setShowStartWarning(false);
  };

  const handleCloseBotWarning = () => {
    setShowBotWarning(false);
  };

  const handlePlayWithBots = () => {
    setShowStartWarning(false);
    handleStartGame();
  };

  const handleStartWithBots = () => {
    setShowBotWarning(false);
    handleStartGame();
  };

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
            onClick={() => {
              if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen();
              }
            }}
            className="fixed top-4 right-4 z-50 bg-gray-800/90 text-white p-2 rounded-full hover:bg-gray-700 transition sm:hidden"
            title="Toggle Fullscreen"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        )}
        
        {/* Test mode indicator */}
        <div className="fixed top-4 left-4 z-50 bg-yellow-500 text-black px-3 py-1 rounded-lg font-semibold shadow-lg">
          TEST MODE - Card Sizing
        </div>
        
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