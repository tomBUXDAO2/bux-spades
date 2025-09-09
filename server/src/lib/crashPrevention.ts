import type { Game } from '../types/game';
import prisma from './prisma';

/**
 * CRASH PREVENTION SYSTEM
 * Prevents rated/league games from crashing and losing player coins
 */
export class CrashPrevention {
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 1000;

  /**
   * Safe database operation with retry and fallback
   */
  public static async safeDbOperation<T>(
    operation: () => Promise<T>,
    fallback?: () => T,
    context: string = 'Unknown'
  ): Promise<T | null> {
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        console.error(`[CRASH PREVENTION] ${context} failed (attempt ${attempt}/${this.MAX_RETRIES}):`, error);
        
        if (attempt === this.MAX_RETRIES) {
          if (fallback) {
            console.log(`[CRASH PREVENTION] Using fallback for ${context}`);
            return fallback();
          }
          console.error(`[CRASH PREVENTION] ${context} failed after all retries - this could cause a crash`);
          return null;
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * attempt));
      }
    }
    return null;
  }

  /**
   * Protect a rated/league game from crashes
   */
  public static async protectRatedGame(game: Game, operation: () => Promise<void>): Promise<void> {
    if (!game.rated && !(game as any).league) {
      // Not a rated/league game, proceed normally
      await operation();
      return;
    }

    console.log(`[CRASH PREVENTION] Protecting rated/league game ${game.id}`);
    
    try {
      // Save game state before operation
      await this.saveGameStateSafely(game);
      
      // Execute the operation
      await operation();
      
      // Save game state after successful operation
      await this.saveGameStateSafely(game);
      
    } catch (error) {
      console.error(`[CRASH PREVENTION] Operation failed for rated game ${game.id}:`, error);
      
      // Try to restore game state
      await this.restoreGameStateSafely(game);
      
      // Re-throw error to be handled by caller
      throw error;
    }
  }

  /**
   * Safely save game state with crash protection
   */
  public static async saveGameStateSafely(game: Game): Promise<void> {
    await this.safeDbOperation(
      async () => {
        const gameState = {
          players: game.players.map(p => p ? {
            id: p.id,
            username: p.username,
            type: p.type,
            position: p.position,
            team: p.team,
            hand: p.hand,
            bid: p.bid,
            tricks: p.tricks,
            points: p.points,
            nil: p.nil,
            blindNil: p.blindNil,
            connected: p.connected
          } : null),
          currentRound: game.currentRound || 1,
          currentTrick: game.currentTrick || 1,
          currentPlayer: typeof game.currentPlayer === 'string' ? game.currentPlayer : (game.currentPlayer as any)?.id || null,
          dealer: game.dealer || 0,
          status: game.status,
          gameMode: game.gameMode,
          minPoints: game.minPoints,
          maxPoints: game.maxPoints,
          buyIn: game.buyIn,
          rules: game.rules,
          roundHistory: game.roundHistory || [],
          currentTrickCards: game.currentTrickCards || [],
          lastAction: game.lastAction,
          lastActionTime: game.lastActionTime,
          play: game.play,
          bidding: game.bidding,
          hands: game.hands,
          team1TotalScore: game.team1TotalScore,
          team2TotalScore: game.team2TotalScore,
          team1Bags: game.team1Bags,
          team2Bags: game.team2Bags,
          playerScores: game.playerScores,
          playerBags: game.playerBags,
          crashProtected: true,
          lastSaved: Date.now()
        };

        if (game.dbGameId) {
          await prisma.game.update({
            where: { id: game.dbGameId },
            data: { gameState: gameState as any }
          });
        }
      },
      () => {
        console.log(`[CRASH PREVENTION] Failed to save game state for ${game.id} - using fallback`);
        // Store in memory as fallback
        (game as any).crashProtectedState = {
          ...game,
          crashProtected: true,
          lastSaved: Date.now()
        };
      },
      `Save game state for ${game.id}`
    );
  }

  /**
   * Safely restore game state after crash
   */
  public static async restoreGameStateSafely(game: Game): Promise<void> {
    await this.safeDbOperation(
      async () => {
        if (game.dbGameId) {
          const dbGame = await prisma.game.findUnique({
            where: { id: game.dbGameId },
            select: { gameState: true }
          });
          
          if (dbGame && (dbGame as any).gameState) {
            const gameState = (dbGame as any).gameState;
            console.log(`[CRASH PREVENTION] Restoring game state for ${game.id}`);
            
            // Restore critical game state
            if (gameState.players) {
              game.players = gameState.players.map((p: any) => p ? {
                ...p,
                socket: null, // Will be reconnected
                lastAction: null,
                lastActionTime: null
              } : null);
            }
            
            if (gameState.status) game.status = gameState.status;
            if (gameState.currentPlayer) game.currentPlayer = gameState.currentPlayer;
            if (gameState.currentRound) game.currentRound = gameState.currentRound;
            if (gameState.currentTrick) game.currentTrick = gameState.currentTrick;
            if (gameState.play) game.play = gameState.play;
            if (gameState.bidding) game.bidding = gameState.bidding;
            if (gameState.playerScores) game.playerScores = gameState.playerScores;
            if (gameState.team1TotalScore) game.team1TotalScore = gameState.team1TotalScore;
            if (gameState.team2TotalScore) game.team2TotalScore = gameState.team2TotalScore;
          }
        }
      },
      () => {
        console.log(`[CRASH PREVENTION] Failed to restore game state for ${game.id} - using memory fallback`);
        // Use memory fallback if available
        if ((game as any).crashProtectedState) {
          const fallbackState = (game as any).crashProtectedState;
          Object.assign(game, fallbackState);
        }
      },
      `Restore game state for ${game.id}`
    );
  }

  /**
   * Validate game state integrity
   */
  public static validateGameIntegrity(game: Game): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Check for null/undefined critical fields
    if (!game.id) issues.push('Game ID is missing');
    if (!game.status) issues.push('Game status is missing');
    if (!game.players || game.players.length !== 4) issues.push('Invalid players array');
    if (game.rated && !game.dbGameId) issues.push('Rated game missing database ID');
    
    // Check for corrupted player data
    game.players.forEach((player, index) => {
      if (player && (!player.id || !player.username)) {
        issues.push(`Player ${index} has missing ID or username`);
      }
    });
    
    // Check for invalid game state transitions
    if (game.status === 'PLAYING' && !game.currentPlayer) {
      issues.push('Game in PLAYING state but no current player');
    }
    
    if (game.status === 'BIDDING' && !game.bidding) {
      issues.push('Game in BIDDING state but no bidding data');
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }

  /**
   * Emergency game recovery
   */
  public static async emergencyRecovery(game: Game): Promise<void> {
    console.log(`[CRASH PREVENTION] Emergency recovery for game ${game.id}`);
    
    const validation = this.validateGameIntegrity(game);
    if (!validation.isValid) {
      console.error(`[CRASH PREVENTION] Game ${game.id} has integrity issues:`, validation.issues);
      
      // Try to fix critical issues
      if (!game.currentPlayer && game.status === 'PLAYING') {
        const firstPlayer = game.players.find(p => p !== null);
        if (firstPlayer) {
          game.currentPlayer = firstPlayer;
          console.log(`[CRASH PREVENTION] Fixed missing current player for ${game.id}`);
        }
      }
      
      if (!game.bidding && game.status === 'BIDDING') {
        game.bidding = {
          bids: [null, null, null, null],
          currentBidderIndex: 0,
          passCount: 0
        };
        console.log(`[CRASH PREVENTION] Fixed missing bidding data for ${game.id}`);
      }
    }
    
    // Force save the recovered state
    await this.saveGameStateSafely(game);
  }
}
