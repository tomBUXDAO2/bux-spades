// Game over utility functions for GameTable component
// These functions handle game completion logic

export interface GameOverData {
  team1Score: number;
  team2Score: number;
  winningTeam: 1 | 2;
  playerScores?: number[];
}

export interface GameOverCallbacks {
  setFinalPlayerScores: (scores: number[]) => void;
  setFinalScores: (scores: { team1Score: number; team2Score: number }) => void;
  setShowHandSummary: (show: boolean) => void;
  setHandSummaryData: (data: any) => void;
  setShowWinner: (show: boolean) => void;
  setShowLoser: (show: boolean) => void;
  showWinner: boolean;
  showLoser: boolean;
}

/**
 * Store final scores based on game mode
 */
export const storeFinalScores = (
  data: GameOverData,
  gameMode: string,
  callbacks: Pick<GameOverCallbacks, 'setFinalPlayerScores' | 'setFinalScores'>
) => {
  console.log('[GAME OVER] Storing final scores:', data, 'gameMode:', gameMode);
  if (gameMode === 'SOLO' && data.playerScores) {
    console.log('[GAME OVER] Setting final player scores:', data.playerScores);
    callbacks.setFinalPlayerScores(data.playerScores);
  } else {
    console.log('[GAME OVER] Setting final team scores:', { team1Score: data.team1Score, team2Score: data.team2Score });
    callbacks.setFinalScores({ team1Score: data.team1Score, team2Score: data.team2Score });
  }
};

/**
 * Call game completion API
 */
export const callGameCompletionAPI = async (
  gameId: string,
  data: Omit<GameOverData, 'playerScores'>
): Promise<void> => {
  try {
    const response = await fetch(`https://bux-spades-server.fly.dev/api/games/${gameId}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        winningTeam: data.winningTeam,
        team1Score: data.team1Score,
        team2Score: data.team2Score
      })
    });
    
    if (response.ok) {
      // Game completion API call successful
    } else {
      console.error('[GAME OVER] Game completion API call failed:', response.status);
    }
  } catch (error) {
    console.error('[GAME OVER] Error calling game completion API:', error);
  }
};

/**
 * Reset game state after game over
 */
export const resetGameState = (
  callbacks: Pick<GameOverCallbacks, 'setShowHandSummary' | 'setHandSummaryData'>
) => {
  callbacks.setShowHandSummary(false);
  callbacks.setHandSummaryData(null);
  // setFinalScores(null); // Don't clear final scores here
};

/**
 * Show winner/loser modal
 */
export const showGameResultModal = (
  winningTeam: 1 | 2,
  callbacks: Pick<GameOverCallbacks, 'setShowWinner' | 'setShowLoser' | 'showWinner' | 'showLoser'>
) => {
  // Only set modal state if not already showing a modal
  if (!callbacks.showWinner && !callbacks.showLoser) {
    if (winningTeam === 1) {
      callbacks.setShowWinner(true);
      callbacks.setShowLoser(false);
    } else {
      callbacks.setShowLoser(true);
      callbacks.setShowWinner(false);
    }
  }
};

/**
 * Main game over handler
 */
export const handleGameOver = async (
  data: GameOverData,
  gameId: string,
  gameMode: string,
  callbacks: GameOverCallbacks
) => {
  storeFinalScores(data, gameMode, callbacks);
  await callGameCompletionAPI(gameId, data);
  resetGameState(callbacks);
  showGameResultModal(data.winningTeam, callbacks);
};
