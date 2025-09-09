import type { Game } from '../types/game';
import { CrashPrevention } from './crashPrevention';

/**
 * Wrapper for all critical game operations to prevent crashes
 */
export class GameOperationWrapper {
  /**
   * Execute a game operation with crash protection
   */
  public static async executeWithProtection<T>(
    game: Game,
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T | null> {
    console.log(`[GAME OPERATION] Starting ${operationName} for game ${game.id}`);
    
    try {
      // Validate game integrity before operation
      const validation = CrashPrevention.validateGameIntegrity(game);
      if (!validation.isValid) {
        console.error(`[GAME OPERATION] Game ${game.id} has integrity issues before ${operationName}:`, validation.issues);
        await CrashPrevention.emergencyRecovery(game);
      }
      
      // Execute operation with crash protection for rated/league games
      if (game.rated || (game as any).league) {
        let result: T | null = null;
        await CrashPrevention.protectRatedGame(game, async () => {
          result = await operation();
        });
        return result;
      } else {
        // Regular game - execute normally
        return await operation();
      }
      
    } catch (error) {
      console.error(`[GAME OPERATION] ${operationName} failed for game ${game.id}:`, error);
      
      // For rated/league games, try emergency recovery
      if (game.rated || (game as any).league) {
        console.log(`[GAME OPERATION] Attempting emergency recovery for rated game ${game.id}`);
        try {
          await CrashPrevention.emergencyRecovery(game);
        } catch (recoveryError) {
          console.error(`[GAME OPERATION] Emergency recovery failed for game ${game.id}:`, recoveryError);
        }
      }
      
      return null;
    }
  }

  /**
   * Execute a database operation with crash protection
   */
  public static async executeDbOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    fallback?: () => T
  ): Promise<T | null> {
    return await CrashPrevention.safeDbOperation(
      operation,
      fallback,
      operationName
    );
  }

  /**
   * Execute multiple operations in sequence with crash protection
   */
  public static async executeSequence<T>(
    game: Game,
    operations: Array<() => Promise<T>>,
    sequenceName: string
  ): Promise<T[]> {
    const results: T[] = [];
    
    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      const result = await this.executeWithProtection(
        game,
        operation,
        `${sequenceName} - step ${i + 1}`
      );
      
      if (result === null) {
        console.error(`[GAME OPERATION] Sequence ${sequenceName} failed at step ${i + 1}`);
        break;
      }
      
      results.push(result);
    }
    
    return results;
  }

  /**
   * Execute operation with timeout protection
   */
  public static async executeWithTimeout<T>(
    game: Game,
    operation: () => Promise<T>,
    operationName: string,
    timeoutMs: number = 30000
  ): Promise<T | null> {
    return new Promise(async (resolve) => {
      const timeout = setTimeout(() => {
        console.error(`[GAME OPERATION] ${operationName} timed out for game ${game.id}`);
        resolve(null);
      }, timeoutMs);
      
      try {
        const result = await this.executeWithProtection(game, operation, operationName);
        clearTimeout(timeout);
        resolve(result);
      } catch (error) {
        clearTimeout(timeout);
        console.error(`[GAME OPERATION] ${operationName} failed for game ${game.id}:`, error);
        resolve(null);
      }
    });
  }
}
