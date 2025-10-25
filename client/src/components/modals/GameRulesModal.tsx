import React, { useState, useEffect } from 'react';

interface GameRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GameRulesModal: React.FC<GameRulesModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'rules' | 'gameTypes' | 'scoring'>('rules');
  
  // Detect screen width for responsive sizing
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [screenHeight, setScreenHeight] = useState(window.innerHeight);
  
  useEffect(() => {
    const handleResize = () => {
      setScreenWidth(window.innerWidth);
      setScreenHeight(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Detect portrait mode
  const isPortrait = screenHeight > screenWidth;
  
  // Apply scaling for 600-649px screens (landscape)
  const isSmallScreen = screenWidth >= 600 && screenWidth <= 649;
  // Apply medium scaling for 650-699px screens
  const isMediumScreen = screenWidth >= 650 && screenWidth <= 699;
  // Apply large scaling for 700-749px screens
  const isLargeScreen = screenWidth >= 700 && screenWidth <= 749;
  // Apply extra large scaling for 750-799px screens
  const isExtraLargeScreen = screenWidth >= 750 && screenWidth <= 799;
  const textScale = isSmallScreen ? 0.7 : (isMediumScreen ? 0.85 : (isLargeScreen ? 0.95 : (isExtraLargeScreen ? 0.98 : 1)));
  const iconScale = isSmallScreen ? 0.7 : (isMediumScreen ? 0.85 : (isLargeScreen ? 0.95 : (isExtraLargeScreen ? 0.98 : 1)));
  const paddingScale = isSmallScreen ? 0.6 : (isMediumScreen ? 0.7 : (isLargeScreen ? 0.85 : (isExtraLargeScreen ? 0.9 : 1)));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" style={{ padding: isPortrait ? '8px' : `${16 * paddingScale}px` }}>
      <div className="bg-slate-800 rounded-lg shadow-xl max-w-4xl w-full overflow-hidden" style={{ maxHeight: isPortrait ? 'calc(100vh - 16px)' : '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700" style={{ paddingTop: `${8 * paddingScale}px`, paddingBottom: `${8 * paddingScale}px`, paddingLeft: isPortrait ? `${12 * paddingScale}px` : `${24 * paddingScale}px`, paddingRight: isPortrait ? `${12 * paddingScale}px` : `${24 * paddingScale}px` }}>
          <h2 className="font-bold text-slate-200" style={{ fontSize: isPortrait ? `${18 * textScale}px` : `${24 * textScale}px` }}>Game Rules</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: `${24 * iconScale}px`, height: `${24 * iconScale}px` }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700">
          <button
            onClick={() => setActiveTab('rules')}
            className={`flex-1 font-medium transition-colors flex items-center justify-center ${
              activeTab === 'rules'
                ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
            style={{ padding: isPortrait ? `${8 * paddingScale}px 12px` : `${16 * paddingScale}px ${24 * paddingScale}px`, gap: `${8 * paddingScale}px`, fontSize: isPortrait ? `${12 * textScale}px` : `${16 * textScale}px` }}
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: isPortrait ? `${16 * iconScale}px` : `${20 * iconScale}px`, height: isPortrait ? `${16 * iconScale}px` : `${20 * iconScale}px` }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Rules</span>
          </button>
          
          <button
            onClick={() => setActiveTab('gameTypes')}
            className={`flex-1 font-medium transition-colors flex items-center justify-center ${
              activeTab === 'gameTypes'
                ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
            style={{ padding: isPortrait ? `${8 * paddingScale}px 12px` : `${16 * paddingScale}px ${24 * paddingScale}px`, gap: `${8 * paddingScale}px`, fontSize: isPortrait ? `${12 * textScale}px` : `${16 * textScale}px` }}
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: isPortrait ? `${16 * iconScale}px` : `${20 * iconScale}px`, height: isPortrait ? `${16 * iconScale}px` : `${20 * iconScale}px` }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span>Game Types</span>
          </button>
          
          <button
            onClick={() => setActiveTab('scoring')}
            className={`flex-1 font-medium transition-colors flex items-center justify-center ${
              activeTab === 'scoring'
                ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
            style={{ padding: isPortrait ? `${8 * paddingScale}px 12px` : `${16 * paddingScale}px ${24 * paddingScale}px`, gap: `${8 * paddingScale}px`, fontSize: isPortrait ? `${12 * textScale}px` : `${16 * textScale}px` }}
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: isPortrait ? `${16 * iconScale}px` : `${20 * iconScale}px`, height: isPortrait ? `${16 * iconScale}px` : `${20 * iconScale}px` }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span>Scoring</span>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[60vh]" style={{ padding: isPortrait ? `${12 * paddingScale}px` : `${24 * paddingScale}px` }}>
          {activeTab === 'rules' && (
            <div className="text-slate-200" style={{ gap: `${16 * paddingScale}px`, display: 'flex', flexDirection: 'column' }}>
              <p style={{ fontSize: `${14 * textScale}px` }}>
                Spades is a game played with 4 players and can be played either solo or more commonly with a partner. 
                Spades are the trump suit (as the name suggests).
              </p>
              
              <p style={{ fontSize: `${14 * textScale}px` }}>
                The object of the game is to reach the target score before the other team/players. 
                The target score is decided at the start by whoever creates the game.
              </p>
              
              <p style={{ fontSize: `${14 * textScale}px` }}>
                Each round the players are all dealt 13 cards and they must then declare their bid for the round 
                (the number of tricks out of 13 that they think they can win).
              </p>
              
              <p style={{ fontSize: `${14 * textScale}px` }}>
                After all players have bid, the trick phase begins. All players play 1 card in clockwise order. 
                Players must follow suit if they can and the highest card played wins the trick. If a player has 
                no cards in the lead suit he can choose to discard a card in another suit or 'cut' by playing a spade. 
                Spades beat all other suits but if more than 1 player plays a spade then the highest spade wins.
              </p>
              
              <p style={{ fontSize: `${14 * textScale}px` }}>
                The winner of the trick is then the first to act on the next trick.
              </p>
              
              <p style={{ fontSize: `${14 * textScale}px` }}>
                Once all 13 tricks have been played, the scores are totalled and (if the game is not over) a new hand begins.
              </p>
              
              <p style={{ fontSize: `${14 * textScale}px` }}>
                In partners games the 2 players play as a team and they must make their total team bid between them 
                but it does not matter how many tricks they win individually.
              </p>
              
              <p style={{ fontSize: `${14 * textScale}px` }}>
                Players can also choose to bid 'nil' which means they have to avoid winning any tricks but they 
                receive a big bonus if they achieve that (and a big forfeit if they don't).
              </p>
              
              <p style={{ fontSize: `${14 * textScale}px` }}>
                The game is over as soon as 1 team or player surpasses the target score or drops below the minimum point score.
              </p>
              
              {/* Table Talk Warning */}
              <div className="bg-red-900/20 border border-red-500/30 rounded-lg" style={{ marginTop: `${32 * paddingScale}px`, padding: `${16 * paddingScale}px` }}>
                <div className="flex items-start" style={{ gap: `${12 * paddingScale}px` }}>
                  <svg className="text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: `${24 * iconScale}px`, height: `${24 * iconScale}px`, marginTop: `${2 * paddingScale}px` }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div>
                    <h3 className="font-semibold text-red-400 mb-2" style={{ fontSize: `${16 * textScale}px` }}>TABLE TALK WARNING</h3>
                    <p className="text-red-200" style={{ fontSize: `${14 * textScale}px` }}>
                      'TABLE TALK' IS STRICTLY FORBIDDEN IN SPADES. PLAYERS MUST NOT REVEAL TO THEIR PARTNER ANY INFORMATION ABOUT THE CARDS THEY HOLD OR WHICH CARDS THEY WANT THEIR PARTNER TO PLAY.
                    </p>
                    <p className="text-red-200 mt-2" style={{ fontSize: `${14 * textScale}px` }}>
                      ANYONE FOUND TO BE DOING THIS IN CHAT OR COMMUNICATING WITH THEIR PARTNER BY ANY OTHER MEANS WILL BE REMOVED AND BANNED FROM THE PLATFORM.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'gameTypes' && (
            <div className="text-slate-200" style={{ gap: `${16 * paddingScale}px`, display: 'flex', flexDirection: 'column' }}>
              <div style={{ gap: `${12 * paddingScale}px`, display: 'flex', flexDirection: 'column' }}>
                <div>
                  <h3 className="font-semibold text-blue-400" style={{ fontSize: `${16 * textScale}px` }}>Regular</h3>
                  <p style={{ fontSize: `${14 * textScale}px` }}>Players can bid whatever they like from 0-13</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-blue-400" style={{ fontSize: `${16 * textScale}px` }}>No Nils</h3>
                  <p style={{ fontSize: `${14 * textScale}px` }}>Nil bids are forbidden and the minimum bid is 1</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-blue-400" style={{ fontSize: `${16 * textScale}px` }}>Blind Nil</h3>
                  <p style={{ fontSize: `${14 * textScale}px` }}>Before seeing their cards players can choose to bid nil without seeing their hand for a chance to win x2 nil bonus</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-blue-400" style={{ fontSize: `${16 * textScale}px` }}>Whiz</h3>
                  <p style={{ fontSize: `${14 * textScale}px` }}>Players can only bid the number of spades in their hand or nil</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-blue-400" style={{ fontSize: `${16 * textScale}px` }}>Mirror</h3>
                  <p style={{ fontSize: `${14 * textScale}px` }}>Players are forced to bid the number of spades in their hand</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-blue-400" style={{ fontSize: `${16 * textScale}px` }}>Suicide (Partners Only)</h3>
                  <p style={{ fontSize: `${14 * textScale}px` }}>1 partner from each team MUST bid nil</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-blue-400" style={{ fontSize: `${16 * textScale}px` }}>Screamer</h3>
                  <p style={{ fontSize: `${14 * textScale}px` }}>Players are not allowed to play a spade if they have other suits available</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-blue-400" style={{ fontSize: `${16 * textScale}px` }}>Assassin</h3>
                  <p style={{ fontSize: `${14 * textScale}px` }}>Players MUST play a spade if they can</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'scoring' && (
            <div className="text-slate-200" style={{ gap: `${16 * paddingScale}px`, display: 'flex', flexDirection: 'column' }}>
              <p style={{ fontSize: `${14 * textScale}px` }}>
                At the end of each round, team/player scores are calculated as follows...
              </p>
              
              <div style={{ gap: `${12 * paddingScale}px`, display: 'flex', flexDirection: 'column' }}>
                <div>
                  <h3 className="font-semibold text-green-400" style={{ fontSize: `${16 * textScale}px` }}>Successful Bids</h3>
                  <p style={{ fontSize: `${14 * textScale}px` }}>+10 points for every trick bid if the bid was successful</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-red-400" style={{ fontSize: `${16 * textScale}px` }}>Failed Bids</h3>
                  <p style={{ fontSize: `${14 * textScale}px` }}>-10 points for every trick bid if the bid was not made</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-green-400" style={{ fontSize: `${16 * textScale}px` }}>Nil Bids</h3>
                  <p style={{ fontSize: `${14 * textScale}px` }}>+100 points for a successful nil bid</p>
                  <p className="text-red-400" style={{ fontSize: `${14 * textScale}px` }}>-100 points for unsuccessful nil bid</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-green-400" style={{ fontSize: `${16 * textScale}px` }}>Blind Nil Bids</h3>
                  <p style={{ fontSize: `${14 * textScale}px` }}>+200 points for successful blind nil bid</p>
                  <p className="text-red-400" style={{ fontSize: `${14 * textScale}px` }}>-200 points for unsuccessful blind nil bid</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-yellow-400" style={{ fontSize: `${16 * textScale}px` }}>Bags</h3>
                  <p style={{ fontSize: `${14 * textScale}px` }}>+1 point for every extra trick won over the bid amount (these are known as 'bags')</p>
                  <p className="text-red-400" style={{ fontSize: `${14 * textScale}px` }}>-100 points for reaching 10 bags</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameRulesModal; 