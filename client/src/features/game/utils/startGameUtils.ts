// Start game utility functions for GameTable component
// These functions handle game starting logic

export interface StartGameCallbacks {
  setIsStarting: (starting: boolean) => void;
  setShowStartWarningModal: (show: boolean) => void;
}

/**
 * Check for empty seats
 */
export const checkEmptySeats = (players: any[]): number => {
  return players.filter(p => !p).length;
};

/**
 * Handle empty seats warning
 */
export const handleEmptySeatsWarning = (
  callbacks: Pick<StartGameCallbacks, 'setShowStartWarningModal' | 'setIsStarting'>
) => {
  callbacks.setShowStartWarningModal(true);
  callbacks.setIsStarting(false);
};

/**
 * Start game directly
 */
export const startGameDirectly = (
  gameId: string,
  socket: any
) => {
  if (socket && gameId) {
    console.log('Starting game with no empty seats');
    socket.emit('start_game', { gameId });
  }
};

/**
 * Reset starting state
 */
export const resetStartingState = (
  callbacks: Pick<StartGameCallbacks, 'setIsStarting'>
) => {
  setTimeout(() => {
    callbacks.setIsStarting(false);
  }, 5000);
};

/**
 * Main start game handler
 */
export const handleStartGame = async (
  players: any[],
  gameId: string,
  socket: any,
  callbacks: StartGameCallbacks
) => {
  callbacks.setIsStarting(true);
  
  const emptySeats = checkEmptySeats(players);
  
  if (emptySeats > 0) {
    handleEmptySeatsWarning(callbacks);
    return;
  }
  
  startGameDirectly(gameId, socket);
  resetStartingState(callbacks);
};
