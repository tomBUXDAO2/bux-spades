import type { Game } from '../types/game';

/**
 * Handle game-related errors and prevent crashes
 */
export class GameErrorHandler {
  /**
   * Handle game not found errors
   */
  public static handleGameNotFound(gameId: string, games: Game[]): { found: boolean; game?: Game } {
    const game = games.find(g => g.id === gameId);
    
    if (!game) {
      console.log(`[GAME ERROR] Game ${gameId} not found in memory`);
      
      // Check if it's a recently finished game that might still be in localStorage
      const recentFinishedGames = games.filter(g => 
        (g.status === 'FINISHED' || g.status === 'FINISHED') && 
        g.id === gameId
      );
      
      if (recentFinishedGames.length > 0) {
        console.log(`[GAME ERROR] Game ${gameId} was recently finished - clearing from client`);
        return { found: false };
      }
      
      return { found: false };
    }
    
    return { found: true, game };
  }

  /**
   * Handle player not found in game
   */
  public static handlePlayerNotFound(game: Game, playerId: string): { found: boolean; playerIndex?: number } {
    const playerIndex = game.players.findIndex(p => p && p.id === playerId);
    
    if (playerIndex === -1) {
      console.log(`[GAME ERROR] Player ${playerId} not found in game ${game.id}`);
      return { found: false };
    }
    
    return { found: true, playerIndex };
  }

  /**
   * Handle invalid game state
   */
  public static handleInvalidGameState(game: Game, expectedState: string): boolean {
    if (game.status !== expectedState) {
      console.log(`[GAME ERROR] Game ${game.id} in wrong state. Expected: ${expectedState}, Actual: ${game.status}`);
      return false;
    }
    
    return true;
  }

  /**
   * Create a safe game response for client
   */
  public static createSafeGameResponse(game: Game, userId?: string): any {
    try {
      return {
        id: game.id,
        status: game.status,
        gameMode: game.gameMode,
        players: game.players.map(p => p ? {
          id: p.id,
          username: p.username,
          avatar: p.avatar,
          type: p.type,
          position: p.position,
          team: p.team,
          connected: p.connected,
          // Don't send sensitive data like hands to other players
          hand: p.id === userId ? p.hand : undefined
        } : null),
        currentRound: game.currentRound,
        currentTrick: game.currentTrick,
        currentPlayer: game.currentPlayer,
        dealer: game.dealer,
        maxPoints: game.maxPoints,
        minPoints: game.minPoints,
        buyIn: game.buyIn,
        rules: game.rules,
        spectators: game.spectators,
        createdAt: game.createdAt,
        updatedAt: game.updatedAt
      };
    } catch (error) {
      console.error(`[GAME ERROR] Error creating safe game response for ${game.id}:`, error);
      return {
        id: game.id,
        status: 'ERROR',
        error: 'Game state corrupted'
      };
    }
  }
}
