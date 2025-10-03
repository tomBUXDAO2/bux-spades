import React from 'react';
import type { GameState } from "../../types/game""";
import { getPlayerColor } from '@/features/game/services/lib/gameRules';

interface GameTableScoreboardProps {
  gameState: GameState;
  isVerySmallScreen: boolean;
  team1Score: number;
  team1Bags: number;
  team2Score: number;
  team2Bags: number;
}

const GameTableScoreboard: React.FC<GameTableScoreboardProps> = ({
  gameState,
  isVerySmallScreen,
  team1Score,
  team1Bags,
  team2Score,
  team2Bags
}) => {
  return (
    <div className={`absolute z-10 px-3 py-2 bg-gray-800/90 rounded-lg shadow-lg ${isVerySmallScreen ? 'top-[-6px] right-[-4px]' : 'top-4 right-4'}`}>
      {gameState.gameMode === 'SOLO' ? (
        // Solo mode - 4 individual players in 2 columns
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((playerIndex) => {
            const playerScore = gameState.playerScores?.[playerIndex] || 0;
            const playerBags = gameState.playerBags?.[playerIndex] || 0;
            const playerColor = getPlayerColor(playerIndex);
            const playerName = gameState.players[playerIndex]?.username || `Player ${playerIndex + 1}`;
            
            return (
              <div key={playerIndex} className="flex items-center">
                <div className={`${playerColor.bg} rounded-full w-2 h-2 mr-1`}></div>
                <span className="text-white font-bold mr-1 text-sm w-8 text-right">{playerScore}</span>
                {/* Player Bags */}
                <div className="flex items-center text-yellow-300 ml-2" title={`${playerName} Bags: ${playerBags}`}> 
                  <img src="/bag.svg" width={16} height={16} alt="Bags" className="mr-1" />
                  <span className="text-xs font-bold">{playerBags}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // Partners mode - 2 teams
        <>
          {/* Red Team Score and Bags */}
          <div className="flex items-center">
            <div className="bg-red-500 rounded-full w-2 h-2 mr-1"></div>
            <span className="text-white font-bold mr-1 text-sm w-8 text-right">{team1Score}</span>
            {/* Red Team Bags */}
            <div className="flex items-center text-yellow-300 ml-2" title={`Red Team Bags: ${team1Bags}`}> 
              <img src="/bag.svg" width={16} height={16} alt="Bags" className="mr-1" />
              <span className="text-xs font-bold">{team1Bags}</span>
            </div>
          </div>

          {/* Blue Team Score and Bags */}
          <div className="flex items-center">
            <div className="bg-blue-500 rounded-full w-2 h-2 mr-1"></div>
            <span className="text-white font-bold mr-1 text-sm w-8 text-right">{team2Score}</span>
            {/* Blue Team Bags */}
            <div className="flex items-center text-yellow-300 ml-2" title={`Blue Team Bags: ${team2Bags}`}> 
              <img src="/bag.svg" width={16} height={16} alt="Bags" className="mr-1" />
              <span className="text-xs font-bold">{team2Bags}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default GameTableScoreboard;
