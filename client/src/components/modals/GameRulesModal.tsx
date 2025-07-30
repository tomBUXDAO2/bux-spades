import React, { useState } from 'react';

interface GameRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GameRulesModal: React.FC<GameRulesModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'rules' | 'gameTypes' | 'scoring'>('rules');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-2xl font-bold text-slate-200">Game Rules</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700">
          <button
            onClick={() => setActiveTab('rules')}
            className={`flex-1 px-6 py-4 text-base font-medium transition-colors flex items-center justify-center space-x-2 ${
              activeTab === 'rules'
                ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Rules</span>
          </button>
          
          <button
            onClick={() => setActiveTab('gameTypes')}
            className={`flex-1 px-6 py-4 text-base font-medium transition-colors flex items-center justify-center space-x-2 ${
              activeTab === 'gameTypes'
                ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span>Game Types</span>
          </button>
          
          <button
            onClick={() => setActiveTab('scoring')}
            className={`flex-1 px-6 py-4 text-base font-medium transition-colors flex items-center justify-center space-x-2 ${
              activeTab === 'scoring'
                ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span>Scoring</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {activeTab === 'rules' && (
            <div className="space-y-4 text-slate-200">
              <p>
                Spades is a game played with 4 players and can be played either solo or more commonly with a partner. 
                Spades are the trump suit (as the name suggests).
              </p>
              
              <p>
                The object of the game is to reach the target score before the other team/players. 
                The target score is decided at the start by whoever creates the game.
              </p>
              
              <p>
                Each round the players are all dealt 13 cards and they must then declare their bid for the round 
                (the number of tricks out of 13 that they think they can win).
              </p>
              
              <p>
                After all players have bid, the trick phase begins. All players play 1 card in clockwise order. 
                Players must follow suit if they can and the highest card played wins the trick. If a player has 
                no cards in the lead suit he can choose to discard a card in another suit or 'cut' by playing a spade. 
                Spades beat all other suits but if more than 1 player plays a spade then the highest spade wins.
              </p>
              
              <p>
                The winner of the trick is then the first to act on the next trick.
              </p>
              
              <p>
                Once all 13 tricks have been played, the scores are totalled and (if the game is not over) a new hand begins.
              </p>
              
              <p>
                In partners games the 2 players play as a team and they must make their total team bid between them 
                but it does not matter how many tricks they win individually.
              </p>
              
              <p>
                Players can also choose to bid 'nil' which means they have to avoid winning any tricks but they 
                receive a big bonus if they achieve that (and a big forfeit if they don't).
              </p>
              
              <p>
                The game is over as soon as 1 team or player surpasses the target score or drops below the minimum point score.
              </p>
              
              {/* Table Talk Warning */}
              <div className="mt-8 p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
                <div className="flex items-start space-x-3">
                  <svg className="w-6 h-6 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <div>
                    <h3 className="font-semibold text-red-400 mb-2">TABLE TALK WARNING</h3>
                    <p className="text-red-200">
                      'TABLE TALK' IS STRICTLY FORBIDDEN IN SPADES. PLAYERS MUST NOT REVEAL TO THEIR PARTNER ANY INFORMATION ABOUT THE CARDS THEY HOLD OR WHICH CARDS THEY WANT THEIR PARTNER TO PLAY.
                    </p>
                    <p className="text-red-200 mt-2">
                      ANYONE FOUND TO BE DOING THIS IN CHAT OR COMMUNICATING WITH THEIR PARTNER BY ANY OTHER MEANS WILL BE REMOVED AND BANNED FROM THE PLATFORM.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'gameTypes' && (
            <div className="space-y-4 text-slate-200">
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-blue-400">Regular</h3>
                  <p>Players can bid whatever they like from 0-13</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-blue-400">No Nils</h3>
                  <p>Nil bids are forbidden and the minimum bid is 1</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-blue-400">Blind Nil</h3>
                  <p>Before seeing their cards players can choose to bid nil without seeing their hand for a chance to win x2 nil bonus</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-blue-400">Whiz</h3>
                  <p>Players can only bid the number of spades in their hand or nil</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-blue-400">Mirror</h3>
                  <p>Players are forced to bid the number of spades in their hand</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-blue-400">Suicide (Partners Only)</h3>
                  <p>1 partner from each team MUST bid nil</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-blue-400">Screamer</h3>
                  <p>Players are not allowed to play a spade if they have other suits available</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-blue-400">Assassin</h3>
                  <p>Players MUST play a spade if they can</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'scoring' && (
            <div className="space-y-4 text-slate-200">
              <p>
                At the end of each round, team/player scores are calculated as follows...
              </p>
              
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-green-400">Successful Bids</h3>
                  <p>+10 points for every trick bid if the bid was successful</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-red-400">Failed Bids</h3>
                  <p>-10 points for every trick bid if the bid was not made</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-green-400">Nil Bids</h3>
                  <p>+100 points for a successful nil bid</p>
                  <p className="text-red-400">-100 points for unsuccessful nil bid</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-green-400">Blind Nil Bids</h3>
                  <p>+200 points for successful blind nil bid</p>
                  <p className="text-red-400">-200 points for unsuccessful blind nil bid</p>
                </div>
                
                <div>
                  <h3 className="font-semibold text-yellow-400">Bags</h3>
                  <p>+1 point for every extra trick won over the bid amount (these are known as 'bags')</p>
                  <p className="text-red-400">-100 points for reaching 10 bags</p>
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