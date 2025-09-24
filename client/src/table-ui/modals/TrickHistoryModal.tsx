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
  gameState?: any; // Add gameState prop
}

const TrickHistoryModal: React.FC<TrickHistoryModalProps> = ({
  isOpen,
  onClose,
  gameId,
  players,
  gameState
}) => {
  const [trickHistory, setTrickHistory] = useState<Round[]>([]);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [currentTrickIndex, setCurrentTrickIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && gameId && gameState) {
      fetchTrickHistory();
    }
  }, [isOpen, gameId, gameState]);

  const fetchTrickHistory = () => {
    setLoading(true);
    try {
      console.log('[TRICK HISTORY] Getting current hand trick history from game state');
      
      if (!gameState || !gameState.play || !gameState.play.tricks) {
        console.log('[TRICK HISTORY] No current game state or tricks available');
        setTrickHistory([]);
        return;
      }
      
      const currentTricks = gameState.play.tricks;
      console.log('[TRICK HISTORY] Current tricks:', currentTricks.length);
      
      if (currentTricks.length === 0) {
        console.log('[TRICK HISTORY] No tricks played yet in current hand');
        setTrickHistory([]);
        return;
      }
      
      // Transform current game tricks to the expected format
      const transformedTricks = currentTricks.map((trick: any, index: number) => ({
        trickNumber: index + 1,
        leadPlayerId: trick.cards?.[0]?.playedBy || players[0]?.id || '',
        winningPlayerId: players[trick.winnerIndex]?.id || '',
        cards: (trick.cards || []).map((card: any, cardIndex: number) => ({
          suit: normalizeSuit(card.suit),
          value: getCardValue(card.rank),
          position: cardIndex,
          playerId: card.playedBy || players[card.playerIndex || 0]?.id || ''
        }))
      }));
      
      // Create a single round with the actual current round number from game state
      const currentRoundNumber = (gameState.round ?? gameState.currentRound ?? gameState.play?.roundNumber ?? 1) as number;
      const currentRound = {
        roundNumber: Math.max(1, Number(currentRoundNumber) || 1),
        tricks: transformedTricks
      };
      
      console.log('[TRICK HISTORY] Transformed current hand:', currentRound);
      setTrickHistory([currentRound]);
      
      // Start with the most recent trick
      setCurrentRoundIndex(0);
      setCurrentTrickIndex(transformedTricks.length - 1);
      
    } catch (error) {
      console.error('[TRICK HISTORY] Failed to get current hand trick history:', error);
      setTrickHistory([]);
    } finally {
      setLoading(false);
    }
  };
  
  // Helper function to get card value
  const getCardValue = (rank: string): number => {
    const values: { [key: string]: number } = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
      'J': 11, 'Q': 12, 'K': 13, 'A': 14
    };
    return values[rank] || 0;
  };

  // Normalize suit variants coming from server into one of: '♠', '♥', '♦', '♣'
  const normalizeSuit = (raw: string): '♠' | '♥' | '♦' | '♣' => {
    if (!raw) return '♠';
    const s = String(raw).toUpperCase();
    if (s === 'S' || s.includes('SPADE') || raw === '♠') return '♠';
    if (s === 'H' || s.includes('HEART') || raw === '♥') return '♥';
    if (s === 'D' || s.includes('DIAMOND') || raw === '♦') return '♦';
    if (s === 'C' || s.includes('CLUB') || raw === '♣') return '♣';
    return '♠';
  };

  // Small-card CSS renderer (mirror table small card styling)
  const SmallCssCard = ({ rank, suit, highlight = false }: { rank: string; suit: '♠'|'♥'|'♦'|'♣'; highlight?: boolean }) => {
    const suitSymbol = suit;
    const suitColor = suit === '♥' || suit === '♦' ? 'text-red-600' : 'text-black';
    const width = 80;
    const height = 120;
    const isVerySmall = height <= 65;
    const cornerRankSize = isVerySmall ? 'text-xs' : 'text-sm';
    const cornerSuitSize = isVerySmall ? 'text-xs' : 'text-xs';
    const centerSuitSize = isVerySmall ? 'text-base' : 'text-2xl';

    return (
      <div
        className={`bg-white rounded-lg relative overflow-hidden border-2 ${highlight ? 'border-yellow-400' : 'border-gray-300'} shadow-lg`}
        style={{ width, height }}
        title={`${rank}${suit}`}
      >
        <div className={`absolute top-0.5 left-0.5 font-bold w-5 text-center`}>
          <div className={`${suitColor} leading-tight ${cornerRankSize}`} style={{ fontSize: isVerySmall ? '0.6rem' : '0.8rem' }}>{rank}</div>
          <div className={`${suitColor} leading-tight ${cornerSuitSize}`} style={{ fontSize: isVerySmall ? '0.4rem' : '0.6rem' }}>{suitSymbol}</div>
        </div>
        <div className={`absolute inset-0 flex items-center justify-center ${suitColor}`}>
          <div className={`${centerSuitSize} font-bold`}>{suitSymbol}</div>
        </div>
        <div className={`absolute bottom-0.5 right-0.5 font-bold w-5 text-center transform rotate-180`}>
          <div className={`${suitColor} leading-tight ${cornerRankSize}`} style={{ fontSize: isVerySmall ? '0.6rem' : '0.8rem' }}>{rank}</div>
          <div className={`${suitColor} leading-tight ${cornerSuitSize}`} style={{ fontSize: isVerySmall ? '0.4rem' : '0.6rem' }}>{suitSymbol}</div>
        </div>
      </div>
    );
  };

  const getCardDisplay = (card: Card) => {
    const valueMap: { [key: number]: string } = {
      2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
      10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A'
    };

    const rank = valueMap[card.value] || '';
    const suit = normalizeSuit(card.suit);
    const suitColor = suit === '♥' || suit === '♦' ? 'text-red-600' : 'text-black';
    
    return {
      rank,
      suit,
      suitColor
    };
  };

  const getPlayerName = (playerId: string) => {
    const player = players.find(p => p?.id === playerId);
    return player ? (player.username || player.name || 'Unknown') : 'Unknown';
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
            <div className="text-center">
              <div className="text-gray-400 text-lg mb-2">No trick history available</div>
              <div className="text-gray-500 text-sm">
                This game may not have any completed tricks yet, or the game hasn't been logged to the database.
              </div>
            </div>
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
            <div className="flex justify-center items-start flex-wrap gap-4 mb-6">
              {currentTrick?.cards && Array.isArray(currentTrick.cards) && currentTrick.cards.map((card, index) => {
                const { rank, suit } = getCardDisplay(card);
                const isWinningCard = card.playerId === currentTrick.winningPlayerId;
                
                return (
                  <div key={index} className="flex flex-col items-center gap-2">
                    <SmallCssCard rank={rank} suit={suit as any} highlight={isWinningCard} />
                    <div className="text-center text-xs text-gray-300 max-w-[80px] truncate" title={getPlayerName(card.playerId)}>
                      {getPlayerName(card.playerId)}
                    </div>
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
                  `Hand ${currentRound.roundNumber} — ${currentTrickIndex + 1} of ${currentRound.tricks.length} tricks`
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