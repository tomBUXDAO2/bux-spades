import React, { useState } from 'react';
import type { GameSettings, GameMode, BiddingOption } from "../../types/game";
import { useWindowSize } from "../../hooks/useWindowSize";

interface CreateGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateGame: (settings: GameSettings) => void;
}

const formatCoins = (value: number) => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}mil`;
  }
  return `${value / 1000}k`;
};

const CreateGameModal: React.FC<CreateGameModalProps> = ({ isOpen, onClose, onCreateGame }) => {
  const { isMobile, isLandscape } = useWindowSize();
  
  // Detect screen width for responsive sizing
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  
  React.useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Apply scaling for 600-649px screens (landscape)
  const isSmallScreen = screenWidth >= 600 && screenWidth <= 649;
  const textScale = isSmallScreen ? 0.85 : 1;
  const iconScale = isSmallScreen ? 0.85 : 1;
  const paddingScale = isSmallScreen ? 0.7 : 1;
  
  // UI state for modal controls
  const [mode, setMode] = useState<GameMode>('PARTNERS');
  const [gameType, setGameType] = useState<'REG' | 'WHIZ' | 'MIRROR' | 'GIMMICK'>('REG');
  const [gimmickType, setGimmickType] = useState<'SUICIDE' | '4 OR NIL' | 'BID 3' | 'BID HEARTS' | 'CRAZY ACES'>('SUICIDE');

  const [minPoints, setMinPoints] = useState(-100);
  const [maxPoints, setMaxPoints] = useState(500);
  const [buyIn, setBuyIn] = useState(100000);
  const [specialRule, setSpecialRule] = useState<'screamer' | 'assassin' | ''>('');
  const [allowNil, setAllowNil] = useState(true);
  const [allowBlindNil, setAllowBlindNil] = useState(false);

  // Get the actual bidding option based on game type and gimmick selection
  const getBiddingOption = (): BiddingOption => {
    if (gameType === 'GIMMICK') {
      return gimmickType as BiddingOption;
    }
    return gameType as BiddingOption;
  };

  // Handle game type changes
  const handleGameTypeChange = (type: 'REG' | 'WHIZ' | 'MIRROR' | 'GIMMICK') => {
    setGameType(type);
    
    // Mirror game type logic: nil always allowed, blind nil never allowed
    if (type === 'MIRROR') {
      setAllowNil(true); // Nil is always allowed in Mirror
      setAllowBlindNil(false); // Blind nil is never allowed in Mirror
    } else if (type === 'WHIZ') {
      // WHIZ: nil always allowed (players can bid nil or number of spades), blind nil never allowed
      setAllowNil(true);
      setAllowBlindNil(false);
    } else if (type === 'GIMMICK') {
      // GIMMICK: nil/blind nil depend on specific gimmick type, but disable toggles
      setAllowNil(true);
      setAllowBlindNil(false);
    }
  };

  // Handle nil toggle changes
  const handleNilToggle = (enabled: boolean) => {
    // Only allow changes for REGULAR games
    if (gameType !== 'REG') return;
    setAllowNil(enabled);
    // If nil is disabled, blind nil should also be disabled
    if (!enabled) {
      setAllowBlindNil(false);
    }
  };

  // Handle blind nil toggle changes
  const handleBlindNilToggle = (enabled: boolean) => {
    // Only allow changes for REGULAR games
    if (gameType !== 'REG') return;
    setAllowBlindNil(enabled);
    // If blind nil is enabled, nil should also be enabled
    if (enabled) {
      setAllowNil(true);
    }
  };

  if (!isOpen) return null;

  const handlePointsChange = (field: 'min' | 'max', delta: number) => {
    if (field === 'min') {
      setMinPoints((prev) => {
        const next = prev + delta;
        return Math.max(-250, Math.min(-100, next));
      });
    } else {
      setMaxPoints((prev) => {
        const next = prev + delta;
        return Math.max(100, Math.min(650, next));
      });
    }
  };

  const handleBuyInChange = (delta: number) => {
    setBuyIn((prev) => {
      const step = prev >= 1000000 ? 100000 : 50000;
      const newValue = prev + delta * step;
      return Math.max(100000, newValue);
    });
  };

  const handleCreate = () => {
    console.log("[CREATE GAME MODAL] handleCreate called");    // Pass all necessary settings to onCreateGame
    onCreateGame({
      gameMode: mode,
      biddingOption: getBiddingOption(),
      minPoints,
      maxPoints,
      buyIn,
      specialRules: {
        screamer: specialRule === 'screamer',
        assassin: specialRule === 'assassin',
      allowNil,
      allowBlindNil
      }
    });
    onClose();
  };

  // Get available gimmick options based on game mode
  const getGimmickOptions = () => {
    const options = ['4 OR NIL', 'BID 3', 'BID HEARTS', 'CRAZY ACES'];
    if (mode === 'PARTNERS') {
      options.unshift('SUICIDE'); // Add SUICIDE at the beginning for partners mode
    }
    return options;
  };

  // Determine if we should use landscape layout
  const useLandscapeLayout = isMobile && isLandscape;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" style={{ padding: `${16 * paddingScale}px` }}>
      <div className={`bg-slate-800 rounded-lg border border-white/20 flex flex-col items-center justify-center w-full ${
        useLandscapeLayout 
          ? 'max-w-4xl max-h-[95vh] overflow-y-auto'
          : isMobile 
            ? 'max-w-sm max-h-[90vh] overflow-y-auto' 
            : 'max-w-md'
      }`} style={{ padding: `${16 * paddingScale}px` }}>
        <h2 className={`font-bold text-slate-200 mb-4 text-center ${
          useLandscapeLayout ? 'text-lg' : isMobile ? 'text-xl' : 'text-2xl'
        }`} style={{ fontSize: `${isSmallScreen ? 18 : (useLandscapeLayout ? 18 : isMobile ? 20 : 24)}px` }}>
          {useLandscapeLayout ? (
            <div className="flex items-center justify-center" style={{ gap: `${16 * paddingScale}px` }}>
              <span>Create Game</span>
              <div className="flex items-center" style={{ gap: `${12 * paddingScale}px` }}>
                <span className={`font-semibold ${mode === 'PARTNERS' ? 'text-white' : 'text-slate-400'}`} style={{ fontSize: `${16 * textScale}px` }}>Partners</span>
                <div
                  className="relative inline-flex items-center bg-slate-700 rounded-full cursor-pointer"
                  onClick={() => setMode(mode === 'PARTNERS' ? 'SOLO' : 'PARTNERS')}
                  style={{ userSelect: 'none', width: `${56 * iconScale}px`, height: `${28 * iconScale}px` }}
                >
                  <input
                    type="checkbox"
                    id="mode-toggle"
                    className="sr-only peer"
                    checked={mode === 'SOLO'}
                    readOnly
                  />
                  <div
                    className={`absolute bg-indigo-600 rounded-full shadow-md transition-transform duration-200`}
                    style={{ 
                      top: `${4 * paddingScale}px`, 
                      left: `${4 * paddingScale}px`, 
                      width: `${20 * iconScale}px`, 
                      height: `${20 * iconScale}px`,
                      transform: mode === 'SOLO' ? `translateX(${28 * iconScale}px)` : 'translateX(0)' 
                    }}
                  ></div>
                </div>
                <span className={`font-semibold ${mode === 'SOLO' ? 'text-white' : 'text-slate-400'}`} style={{ fontSize: `${16 * textScale}px` }}>Solo</span>
              </div>
            </div>
          ) : (
            'Create Game'
          )}
        </h2>
        
        {useLandscapeLayout ? (
          // Landscape layout - two column arrangement
          <div className="w-full flex" style={{ gap: `${32 * paddingScale}px` }}>
            {/* Left Column */}
            <div className="flex-1 flex flex-col items-center justify-center" style={{ gap: `${16 * paddingScale}px` }}>
              {/* Coins */}
              <div className="flex flex-col items-center" style={{ gap: `${8 * paddingScale}px` }}>
                <label className="font-bold text-yellow-500" style={{ fontSize: `${16 * textScale}px` }}>Coins</label>
                <div className="flex items-center" style={{ gap: `${10 * paddingScale}px` }}>
                  <button onClick={() => handleBuyInChange(-1)} className="flex items-center justify-center bg-slate-600 text-slate-200 rounded-full" style={{ width: `${36 * iconScale}px`, height: `${36 * iconScale}px`, fontSize: `${16 * textScale}px` }}>-</button>
                  <span className="text-center flex items-center justify-center bg-slate-100 text-slate-800 rounded font-semibold" style={{ gap: `${4 * paddingScale}px`, padding: `${6 * paddingScale}px ${10 * paddingScale}px`, fontSize: `${16 * textScale}px`, width: `${72 * iconScale}px` }}>
                    <svg className="text-yellow-500" fill="currentColor" viewBox="0 0 20 20" style={{ width: `${18 * iconScale}px`, height: `${18 * iconScale}px` }}>
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                    {formatCoins(buyIn)}
                  </span>
                  <button onClick={() => handleBuyInChange(1)} className="flex items-center justify-center bg-slate-600 text-slate-200 rounded-full" style={{ width: `${36 * iconScale}px`, height: `${36 * iconScale}px`, fontSize: `${16 * textScale}px` }}>+</button>
                </div>
                {/* Prize display */}
                <div className="font-medium text-indigo-300 text-center" style={{ fontSize: `${12 * textScale}px` }}>
                  {(() => {
                    const prizePot = buyIn * 4 * 0.9;
                    if (mode === 'PARTNERS') {
                      return `Prize = ${formatCoins(prizePot / 2)} each`;
                    } else {
                      const secondPlacePrize = buyIn;
                      const firstPlacePrize = prizePot - secondPlacePrize;
                      return `1st = ${formatCoins(firstPlacePrize)}, 2nd = ${formatCoins(secondPlacePrize)}`;
                    }
                  })()}
                </div>
              </div>

              {/* Min and Max Points */}
              <div className="flex flex-col items-center" style={{ gap: `${8 * paddingScale}px` }}>
                <label className="text-slate-300 font-medium" style={{ fontSize: `${16 * textScale}px` }}>Points Range</label>
                <div className="flex items-center" style={{ gap: `${16 * paddingScale}px` }}>
                  <div className="flex items-center" style={{ gap: `${6 * paddingScale}px` }}>
                    <label className="text-slate-300" style={{ fontSize: `${14 * textScale}px` }}>Min:</label>
                    <button onClick={() => handlePointsChange('min', -50)} className="flex items-center justify-center bg-slate-600 text-slate-200 rounded-full" style={{ width: `${28 * iconScale}px`, height: `${28 * iconScale}px`, fontSize: `${14 * textScale}px` }} disabled={minPoints <= -250}>-</button>
                    <input
                      type="text"
                      value={minPoints}
                      readOnly
                      className="text-center bg-slate-100 text-slate-800 rounded font-semibold"
                      style={{ width: `${56 * iconScale}px`, padding: `${4 * paddingScale}px ${6 * paddingScale}px`, fontSize: `${14 * textScale}px` }}
                    />
                    <button onClick={() => handlePointsChange('min', 50)} className="flex items-center justify-center bg-slate-600 text-slate-200 rounded-full" style={{ width: `${28 * iconScale}px`, height: `${28 * iconScale}px`, fontSize: `${14 * textScale}px` }} disabled={minPoints >= -100}>+</button>
                  </div>
                  <div className="flex items-center" style={{ gap: `${6 * paddingScale}px` }}>
                    <label className="text-slate-300" style={{ fontSize: `${14 * textScale}px` }}>Max:</label>
                    <button onClick={() => handlePointsChange('max', -50)} className="flex items-center justify-center bg-slate-600 text-slate-200 rounded-full" style={{ width: `${28 * iconScale}px`, height: `${28 * iconScale}px`, fontSize: `${14 * textScale}px` }} disabled={maxPoints <= 100}>-</button>
                    <input
                      type="text"
                      value={maxPoints}
                      readOnly
                      className="text-center bg-slate-100 text-slate-800 rounded font-semibold"
                      style={{ width: `${56 * iconScale}px`, padding: `${4 * paddingScale}px ${6 * paddingScale}px`, fontSize: `${14 * textScale}px` }}
                    />
                    <button onClick={() => handlePointsChange('max', 50)} className="flex items-center justify-center bg-slate-600 text-slate-200 rounded-full" style={{ width: `${28 * iconScale}px`, height: `${28 * iconScale}px`, fontSize: `${14 * textScale}px` }} disabled={maxPoints >= 650}>+</button>
                  </div>
                </div>
              </div>

              {/* Special Rules */}
              <div className="flex flex-col items-center" style={{ gap: `${8 * paddingScale}px` }}>
                <label className="font-bold text-pink-400" style={{ fontSize: `${16 * textScale}px` }}>Special Rules</label>
                <div className="flex" style={{ gap: `${16 * paddingScale}px` }}>
                  <label className="flex items-center" style={{ gap: `${8 * paddingScale}px` }}>
                    <input
                      type="checkbox"
                      checked={specialRule === 'screamer'}
                      onChange={() => setSpecialRule(specialRule === 'screamer' ? '' : 'screamer')}
                      className="form-checkbox bg-slate-700 text-indigo-600 rounded"
                      style={{ width: `${18 * iconScale}px`, height: `${18 * iconScale}px` }}
                    />
                    <span className="text-slate-300" style={{ fontSize: `${16 * textScale}px` }}> Screamer</span>
                  </label>
                  <label className="flex items-center" style={{ gap: `${8 * paddingScale}px` }}>
                    <input
                      type="checkbox"
                      checked={specialRule === 'assassin'}
                      onChange={() => setSpecialRule(specialRule === 'assassin' ? '' : 'assassin')}
                      className="form-checkbox bg-slate-700 text-indigo-600 rounded"
                      style={{ width: `${18 * iconScale}px`, height: `${18 * iconScale}px` }}
                    />
                    <span className="text-slate-300" style={{ fontSize: `${16 * textScale}px` }}>⚔️ Assassin</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="flex-1 flex flex-col items-center justify-center" style={{ gap: `${16 * paddingScale}px` }}>
              {/* Game Type Radio Buttons */}
              <div className="flex flex-col items-center" style={{ gap: `${8 * paddingScale}px` }}>
                <label className="text-slate-300 font-medium" style={{ fontSize: `${16 * textScale}px` }}>Game Type</label>
                <div className="flex" style={{ gap: `${10 * paddingScale}px` }}>
                  {['REG', 'WHIZ', 'MIRROR', 'GIMMICK'].map((opt) => (
                    <label key={opt} className="flex items-center cursor-pointer" style={{ gap: `${6 * paddingScale}px` }}>
                      <input
                        type="radio"
                        name="gameType"
                        value={opt}
                        checked={gameType === opt}
                        onChange={() => handleGameTypeChange(opt as 'REG' | 'WHIZ' | 'MIRROR' | 'GIMMICK')}
                        style={{ width: `${18 * iconScale}px`, height: `${18 * iconScale}px` }}
                      />
                      <span className="text-slate-200" style={{ fontSize: `${14 * textScale}px` }}>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Gimmick Dropdown */}
              <div className="flex flex-col items-center" style={{ gap: `${8 * paddingScale}px` }}>
                <label className="text-slate-300 font-medium" style={{ fontSize: `${16 * textScale}px` }}>Gimmick</label>
                <select
                  value={gimmickType}
                  onChange={(e) => setGimmickType(e.target.value as 'SUICIDE' | '4 OR NIL' | 'BID 3' | 'BID HEARTS' | 'CRAZY ACES')}
                  disabled={gameType !== 'GIMMICK'}
                  className={`rounded text-slate-800 font-semibold ${
                    gameType === 'GIMMICK' 
                      ? 'bg-slate-100 cursor-pointer' 
                      : 'bg-slate-600 text-slate-400 cursor-not-allowed'
                  }`}
                  style={{ padding: `${6 * paddingScale}px ${14 * paddingScale}px`, fontSize: `${16 * textScale}px` }}
                >
                  {getGimmickOptions().map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              {/* Nil and Blind Nil toggles */}
              <div className="flex flex-col items-center" style={{ gap: `${8 * paddingScale}px` }}>
                <label className="text-slate-300 font-medium" style={{ fontSize: `${16 * textScale}px` }}>Nil Options</label>
                <div className="flex" style={{ gap: `${16 * paddingScale}px` }}>
                  <div className="flex items-center" style={{ gap: `${8 * paddingScale}px` }}>
                    <span className="text-slate-200" style={{ fontSize: `${14 * textScale}px` }}>Nil:</span>
                    <div
                      className={`relative inline-flex items-center bg-slate-700 rounded-full cursor-pointer ${gameType !== 'REG' ? 'cursor-not-allowed opacity-50' : ''}`}
                      onClick={() => gameType === 'REG' && handleNilToggle(!allowNil)}
                      style={{ userSelect: 'none', width: `${48 * iconScale}px`, height: `${24 * iconScale}px` }}
                    >
                      <div
                        className={`absolute bg-indigo-600 rounded-full shadow-md transition-transform duration-200`}
                        style={{ 
                          top: `${4 * paddingScale}px`, 
                          left: `${4 * paddingScale}px`, 
                          width: `${16 * iconScale}px`, 
                          height: `${16 * iconScale}px`,
                          transform: allowNil ? `translateX(${24 * iconScale}px)` : 'translateX(0)' 
                        }}
                      ></div>
                    </div>
                    <span className={`${allowNil ? 'text-white' : 'text-slate-400'}`} style={{ fontSize: `${14 * textScale}px` }}>{allowNil ? 'On' : 'Off'}</span>
                  </div>
                  <div className="flex items-center" style={{ gap: `${8 * paddingScale}px` }}>
                    <span className="text-slate-200" style={{ fontSize: `${14 * textScale}px` }}>Blind Nil:</span>
                    <div
                      className={`relative inline-flex items-center bg-slate-700 rounded-full cursor-pointer ${gameType !== 'REG' || !allowNil ? 'cursor-not-allowed opacity-50' : ''}`}
                      onClick={() => !(gameType !== 'REG' || !allowNil) && handleBlindNilToggle(!allowBlindNil)}
                      style={{ userSelect: 'none', width: `${48 * iconScale}px`, height: `${24 * iconScale}px` }}
                    >
                      <div
                        className={`absolute bg-indigo-600 rounded-full shadow-md transition-transform duration-200`}
                        style={{ 
                          top: `${4 * paddingScale}px`, 
                          left: `${4 * paddingScale}px`, 
                          width: `${16 * iconScale}px`, 
                          height: `${16 * iconScale}px`,
                          transform: allowBlindNil ? `translateX(${24 * iconScale}px)` : 'translateX(0)' 
                        }}
                      ></div>
                    </div>
                    <span className={`${allowBlindNil ? 'text-white' : 'text-slate-400'}`} style={{ fontSize: `${14 * textScale}px` }}>{allowBlindNil ? 'On' : 'Off'}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col items-center" style={{ gap: `${8 * paddingScale}px` }}>
                <div className="flex" style={{ gap: `${12 * paddingScale}px` }}>
              <button
                onClick={onClose}
                    className="text-slate-300 hover:text-slate-100 transition-colors"
                    style={{ padding: `${6 * paddingScale}px ${16 * paddingScale}px`, fontSize: `${16 * textScale}px` }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors"
                    style={{ padding: `${6 * paddingScale}px ${16 * paddingScale}px`, fontSize: `${16 * textScale}px` }}
              >
                    Create Game
              </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Portrait layout - vertical arrangement (existing code)
          <div className={`w-full flex flex-col items-center justify-center ${
            isMobile ? 'space-y-2' : 'space-y-3'
          }`}>
          {/* Partners/Solo Toggle with text outside */}
            <div className={`flex items-center justify-center w-full gap-2 ${
              isMobile ? 'my-1' : 'my-2'
            }`}>
              <span className={`font-semibold ${mode === 'PARTNERS' ? 'text-white' : 'text-slate-400'} ${
                isMobile ? 'text-sm' : 'text-base'
              }`}>Partners</span>
            <div
              className="relative inline-flex items-center w-16 h-8 bg-slate-700 rounded-full cursor-pointer"
              onClick={() => setMode(mode === 'PARTNERS' ? 'SOLO' : 'PARTNERS')}
              style={{ userSelect: 'none' }}
            >
              <input
                type="checkbox"
                id="mode-toggle"
                className="sr-only peer"
                checked={mode === 'SOLO'}
                readOnly
              />
              <div
                className={`absolute top-1 left-1 w-6 h-6 bg-indigo-600 rounded-full shadow-md transition-transform duration-200 ${mode === 'SOLO' ? 'translate-x-8' : ''}`}
                style={{ transform: mode === 'SOLO' ? 'translateX(32px)' : 'translateX(0)' }}
              ></div>
            </div>
              <span className={`font-semibold ${mode === 'SOLO' ? 'text-white' : 'text-slate-400'} ${
                isMobile ? 'text-sm' : 'text-base'
              }`}>Solo</span>
          </div>

          {/* Coins with coin icon and prize display - moved above bidding options */}
            <div className={`w-full flex flex-col items-center ${
              isMobile ? 'my-1' : 'my-2'
            }`}>
              <label className={`font-bold text-yellow-500 mb-2 text-center ${
                isMobile ? 'text-lg' : 'text-2xl'
              }`}>Coins</label>
            <div className="flex items-center gap-4 justify-center">
                <button onClick={() => handleBuyInChange(-1)} className={`flex items-center justify-center bg-slate-600 text-slate-200 rounded-full ${
                  isMobile ? 'w-7 h-7' : 'w-8 h-8'
                }`}>-</button>
                <span className={`text-center flex items-center justify-center gap-1 bg-slate-100 text-slate-800 rounded-md px-2 py-1 font-semibold ${
                  isMobile ? 'w-16 text-sm' : 'w-20'
                }`}>
                  <svg className={`text-yellow-500 mr-1 ${
                    isMobile ? 'w-4 h-4' : 'w-5 h-5'
                  }`} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
                {formatCoins(buyIn)}
              </span>
                <button onClick={() => handleBuyInChange(1)} className={`flex items-center justify-center bg-slate-600 text-slate-200 rounded-full ${
                  isMobile ? 'w-7 h-7' : 'w-8 h-8'
                }`}>+</button>
            </div>
            {/* Prize display */}
              <div className={`mt-2 font-medium text-indigo-300 text-center ${
                isMobile ? 'text-xs' : 'text-sm'
              }`}>
              {(() => {
                const prizePot = buyIn * 4 * 0.9;
                if (mode === 'PARTNERS') {
                  return ` (Prize = ${formatCoins(prizePot / 2)} each)`;
                } else {
                  // Solo mode: 2nd place gets their stake back, 1st place gets the remainder
                  const secondPlacePrize = buyIn; // Exactly their stake back
                  const firstPlacePrize = prizePot - secondPlacePrize; // Remainder after 2nd place gets their stake
                  return ` (1st = ${formatCoins(firstPlacePrize)}, 2nd = ${formatCoins(secondPlacePrize)})`;
                }
              })()}
            </div>
          </div>

          {/* Min and Max Points inline */}
            <div className={`w-full flex flex-col items-center ${
              isMobile ? 'my-1' : 'my-2'
            }`}>
              <div className={`flex items-center justify-center w-full ${
                isMobile ? 'gap-4' : 'gap-8'
              }`}>
              <div className="flex flex-col items-center w-1/2">
                  <label className={`block text-slate-300 mb-2 text-center ${
                    isMobile ? 'text-sm' : ''
                  }`}>Min Points</label>
                <div className="flex gap-2 items-center justify-center">
                    <button onClick={() => handlePointsChange('min', -50)} className={`flex items-center justify-center bg-slate-600 text-slate-200 rounded-full ${
                      isMobile ? 'w-7 h-7' : 'w-8 h-8'
                    }`} disabled={minPoints <= -250}>-</button>
                  <input
                    type="text"
                    value={minPoints}
                    readOnly
                      className={`text-center bg-slate-100 text-slate-800 rounded-md px-2 py-1 font-semibold ${
                        isMobile ? 'w-12 text-sm' : 'w-16'
                      }`}
                  />
                    <button onClick={() => handlePointsChange('min', 50)} className={`flex items-center justify-center bg-slate-600 text-slate-200 rounded-full ${
                      isMobile ? 'w-7 h-7' : 'w-8 h-8'
                    }`} disabled={minPoints >= -100}>+</button>
                </div>
              </div>
              <div className="flex flex-col items-center w-1/2">
                  <label className={`block text-slate-300 mb-2 text-center ${
                    isMobile ? 'text-sm' : ''
                  }`}>Max Points</label>
                <div className="flex gap-2 items-center justify-center">
                    <button onClick={() => handlePointsChange('max', -50)} className={`flex items-center justify-center bg-slate-600 text-slate-200 rounded-full ${
                      isMobile ? 'w-7 h-7' : 'w-8 h-8'
                    }`} disabled={maxPoints <= 100}>-</button>
                  <input
                    type="text"
                    value={maxPoints}
                    readOnly
                      className={`text-center bg-slate-100 text-slate-800 rounded-md px-2 py-1 font-semibold ${
                        isMobile ? 'w-12 text-sm' : 'w-16'
                      }`}
                  />
                    <button onClick={() => handlePointsChange('max', 50)} className={`flex items-center justify-center bg-slate-600 text-slate-200 rounded-full ${
                      isMobile ? 'w-7 h-7' : 'w-8 h-8'
                    }`} disabled={maxPoints >= 650}>+</button>
                </div>
              </div>
            </div>
          </div>

          {/* Game Type Radio Buttons */}
            <div className={`w-full flex flex-col items-center ${
              isMobile ? 'my-1' : 'my-2'
            }`}>
              <div className={`flex flex-wrap justify-center mb-2 ${
                isMobile ? 'gap-2' : 'gap-4'
              }`}>
              {['REG', 'WHIZ', 'MIRROR', 'GIMMICK'].map((opt) => (
                <label key={opt} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="gameType"
                    value={opt}
                    checked={gameType === opt}
                    onChange={() => handleGameTypeChange(opt as 'REG' | 'WHIZ' | 'MIRROR' | 'GIMMICK')}
                  />
                    <span className={`text-slate-200 ${
                      isMobile ? 'text-sm' : ''
                    }`}>{opt}</span>
                </label>
              ))}
            </div>

            {/* Gimmick Dropdown */}
            <div className="w-full flex justify-center mb-2">
              <select
                value={gimmickType}
                onChange={(e) => setGimmickType(e.target.value as 'SUICIDE' | '4 OR NIL' | 'BID 3' | 'BID HEARTS' | 'CRAZY ACES')}
                disabled={gameType !== 'GIMMICK'}
                className={`px-3 py-1 rounded-md text-slate-800 font-semibold ${
                  gameType === 'GIMMICK' 
                    ? 'bg-slate-100 cursor-pointer' 
                    : 'bg-slate-600 text-slate-400 cursor-not-allowed'
                  } ${isMobile ? 'text-sm' : ''}`}
              >
                {getGimmickOptions().map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            {/* Nil and Blind Nil toggles */}
              <div className={`flex flex-row justify-center items-center ${
                isMobile ? 'gap-4 my-1' : 'gap-6 my-2'
              }`} style={{ minHeight: '2.2rem' }}>
              <div className="flex items-center gap-2">
                  <span className={`text-slate-200 ${
                    isMobile ? 'text-xs' : 'text-sm'
                  }`}>Nil:</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${!allowNil ? 'text-white' : 'text-slate-400'}`}>Off</span>
                  <div
                    className={`relative inline-flex items-center w-12 h-6 bg-slate-700 rounded-full cursor-pointer ${gameType !== 'REG' ? 'cursor-not-allowed opacity-50' : ''}`}
                    onClick={() => gameType === 'REG' && handleNilToggle(!allowNil)}
                    style={{ userSelect: 'none' }}
                  >
                    <div
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-indigo-600 rounded-full shadow-md transition-transform duration-200 ${allowNil ? 'translate-x-6' : ''}`}
                      style={{ transform: allowNil ? 'translateX(24px)' : 'translateX(0)' }}
                    ></div>
                  </div>
                  <span className={`text-xs ${allowNil ? 'text-white' : 'text-slate-400'}`}>On</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                  <span className={`text-slate-200 ${
                    isMobile ? 'text-xs' : 'text-sm'
                  }`}>Blind Nil:</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${!allowBlindNil ? 'text-white' : 'text-slate-400'}`}>Off</span>
                  <div
                    className={`relative inline-flex items-center w-12 h-6 bg-slate-700 rounded-full cursor-pointer ${gameType !== 'REG' || !allowNil ? 'cursor-not-allowed opacity-50' : ''}`}
                    onClick={() => !(gameType !== 'REG' || !allowNil) && handleBlindNilToggle(!allowBlindNil)}
                    style={{ userSelect: 'none' }}
                  >
                    <div
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-indigo-600 rounded-full shadow-md transition-transform duration-200 ${allowBlindNil ? 'translate-x-6' : ''}`}
                      style={{ transform: allowBlindNil ? 'translateX(24px)' : 'translateX(0)' }}
                    ></div>
                  </div>
                  <span className={`text-xs ${allowBlindNil ? 'text-white' : 'text-slate-400'}`}>On</span>
                </div>
              </div>
            </div>
          </div>

          {/* Special Rules with emojis, mutually exclusive */}
            <div className={`w-full flex flex-col items-center ${
              isMobile ? 'my-1' : 'my-2'
            }`}>
              <label className={`font-bold text-pink-400 mb-2 text-center ${
                isMobile ? 'text-lg' : 'text-2xl'
              }`}>Special Rules</label>
              <div className={`flex flex-row justify-center ${
                isMobile ? 'gap-4' : 'gap-6'
              }`}>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={specialRule === 'screamer'}
                  onChange={() => setSpecialRule(specialRule === 'screamer' ? '' : 'screamer')}
                  className="form-checkbox bg-slate-700 text-indigo-600 rounded"
                />
                  <span className={`text-slate-300 ${
                    isMobile ? 'text-sm' : ''
                  }`}>🎭 Screamer</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={specialRule === 'assassin'}
                  onChange={() => setSpecialRule(specialRule === 'assassin' ? '' : 'assassin')}
                  className="form-checkbox bg-slate-700 text-indigo-600 rounded"
                />
                  <span className={`text-slate-300 ${
                    isMobile ? 'text-sm' : ''
                  }`}>⚔️ Assassin</span>
              </label>
            </div>
          </div>
          </div>
        )}

        {/* Action buttons for portrait mode only */}
        {!useLandscapeLayout && (
          <div className={`flex justify-center gap-4 mt-4 w-full ${
            isMobile ? 'mt-3' : 'mt-4'
          }`}>
            <button
              onClick={onClose}
              className={`text-slate-300 hover:text-slate-100 transition-colors ${
                isMobile ? 'px-3 py-2 text-sm' : 'px-4 py-2'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              className={`bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors ${
                isMobile ? 'px-3 py-2 text-sm' : 'px-4 py-2'
              }`}
            >
              Create Game
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateGameModal; 