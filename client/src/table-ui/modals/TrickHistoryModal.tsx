import React, { useState, useEffect } from 'react';
import { IoClose, IoChevronBack, IoChevronForward } from 'react-icons/io5';

interface Card {
  suit: string;
  value: number;
  position: number;
  playerId: string;
}

interface Trick {
  trickNumber: number;
  leadPlayerId: string;
  winningPlayerId: string;
  cards: Card[];
}

interface Round {
  roundNumber: number;
  tricks: Trick[];
}

interface TrickHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameId: string;
  players: any[];
}

const TrickHistoryModal: React.FC<TrickHistoryModalProps> = ({
  isOpen,
  onClose,
  gameId,
  players
}) => {
  const [trickHistory, setTrickHistory] = useState<Round[]>([]);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [currentTrickIndex, setCurrentTrickIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && gameId) {
      fetchTrickHistory();
    }
  }, [isOpen, gameId]);

  const fetchTrickHistory = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/games/${gameId}/trick-history`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setTrickHistory(data.trickHistory || []);
        
        // Start with the most recent trick
        if (data.trickHistory && data.trickHistory.length > 0) {
          const lastRound = data.trickHistory[data.trickHistory.length - 1];
          setCurrentRoundIndex(data.trickHistory.length - 1);
          setCurrentTrickIndex(lastRound.tricks.length - 1);
        }
      }
    } catch (error) {
      console.error('Failed to fetch trick history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCardDisplay = (card: Card) => {
    const suitMap: { [key: string]: string } = {
      'SPADES': '♠',
      'HEARTS': '♥',
      'DIAMONDS': '♦',
      'CLUBS': '♣'
    };

    const valueMap: { [key: number]: string } = {
      2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
      10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A'
    };

    const suitColor = card.suit === 'HEARTS' || card.suit === 'DIAMONDS' ? 'text-red-600' : 'text-black';
    
    return {
      display: `${valueMap[card.value]}${suitMap[card.suit]}`,
      suitColor
    };
  };

  const getPlayerName = (playerId: string) => {
    const player = players.find(p => p.id === playerId);
    return player ? player.username : 'Unknown';
  };

  const currentRound = trickHistory[currentRoundIndex];
  const currentTrick = currentRound?.tricks[currentTrickIndex];

  const canGoBack = currentRoundIndex > 0 || currentTrickIndex > 0;
  const canGoForward = currentRoundIndex < trickHistory.length - 1 || 
                      (currentRoundIndex === trickHistory.length - 1 && currentTrickIndex < (currentRound?.tricks.length || 0) - 1);

  const goBack = () => {
    if (currentTrickIndex > 0) {
      setCurrentTrickIndex(currentTrickIndex - 1);
    } else if (currentRoundIndex > 0) {
      const prevRound = trickHistory[currentRoundIndex - 1];
      setCurrentRoundIndex(currentRoundIndex - 1);
      setCurrentTrickIndex(prevRound.tricks.length - 1);
    }
  };

  const goForward = () => {
    if (currentTrickIndex < (currentRound?.tricks.length || 0) - 1) {
      setCurrentTrickIndex(currentTrickIndex + 1);
    } else if (currentRoundIndex < trickHistory.length - 1) {
      setCurrentRoundIndex(currentRoundIndex + 1);
      setCurrentTrickIndex(0);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 shadow-xl border border-white/20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-bold text-white">
            Trick History
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <IoClose className="h-6 w-6" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-400 text-lg">Loading trick history...</div>
          </div>
        ) : trickHistory.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-400 text-lg">No trick history available</div>
          </div>
        ) : (
          <>
            {/* Navigation Info */}
            <div className="text-center mb-6">
              <div className="text-white text-lg mb-2">
                Round {currentRound?.roundNumber}, Trick {currentTrick?.trickNumber}
              </div>
              <div className="text-gray-400 text-sm">
                Led by {getPlayerName(currentTrick?.leadPlayerId || '')} • 
                Won by {getPlayerName(currentTrick?.winningPlayerId || '')}
              </div>
            </div>

            {/* Cards Display */}
            <div className="flex justify-center items-center gap-4 mb-6">
              {currentTrick?.cards.map((card, index) => {
                const { display, suitColor } = getCardDisplay(card);
                const isWinningCard = card.playerId === currentTrick.winningPlayerId;
                
                return (
                  <div
                    key={index}
                    className={`relative bg-white rounded-lg p-4 shadow-lg border-2 ${
                      isWinningCard ? 'border-yellow-400' : 'border-gray-300'
                    }`}
                    style={{ minWidth: '80px', minHeight: '120px' }}
                  >
                    <div className={`text-center ${suitColor} font-bold text-lg`}>
                      {display}
                    </div>
                    <div className="text-center text-xs text-gray-600 mt-2">
                      {getPlayerName(card.playerId)}
                    </div>
                    {isWinningCard && (
                      <div className="absolute -top-2 -right-2 bg-yellow-400 text-black rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                        ✓
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Navigation Controls */}
            <div className="flex justify-between items-center">
              <button
                onClick={goBack}
                disabled={!canGoBack}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  canGoBack 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                    : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                }`}
              >
                <IoChevronBack className="h-5 w-5" />
                Previous Trick
              </button>

              <div className="text-gray-400 text-sm">
                {trickHistory.length > 0 && currentRound && (
                  `${currentRoundIndex + 1} of ${trickHistory.length} rounds, ${currentTrickIndex + 1} of ${currentRound.tricks.length} tricks`
                )}
              </div>

              <button
                onClick={goForward}
                disabled={!canGoForward}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  canGoForward 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                    : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                }`}
              >
                Next Trick
                <IoChevronForward className="h-5 w-5" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TrickHistoryModal; 