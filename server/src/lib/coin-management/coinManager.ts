import prisma from '../prisma';
import type { Game } from '../../types/game';

/**
 * Handles all coin operations for completed games
 * This ensures coins are only deducted/payed when games are FINISHED
 * and prevents double deductions/payouts
 */
export class CoinManager {
  private static processedGames = new Set<string>();

  /**
   * Process coins for a completed game
   * Only processes once per game to prevent double deductions/payouts
   */
  static async processGameCoins(game: Game, winningTeamOrPlayer: number): Promise<void> {
    if (!game.dbGameId) {
      console.log('[COIN MANAGER] No dbGameId, skipping coin processing');
      return;
    }

    // Check if we've already processed this game
    if (this.processedGames.has(game.dbGameId)) {
      console.log('[COIN MANAGER] Game already processed, skipping:', game.dbGameId);
      return;
    }

    // Only process rated games (for now, we'll make it process all games for testing)
    // if (!game.rated) {
    //   console.log('[COIN MANAGER] Game not rated, skipping coin processing');
    //   return;
    // }

    if (!game.buyIn || game.buyIn <= 0) {
      console.log('[COIN MANAGER] No buy-in amount, skipping coin processing');
      return;
    }

    console.log('[COIN MANAGER] Processing coins for game:', game.dbGameId, 'Buy-in:', game.buyIn);

    try {
      // Mark this game as processed to prevent double processing
      this.processedGames.add(game.dbGameId);

      // Get all human players
      const humanPlayers = game.players.filter(p => p && p.type === 'human');
      
      if (humanPlayers.length === 0) {
        console.log('[COIN MANAGER] No human players, skipping coin processing');
        return;
      }

      // Process coins in a transaction
      await prisma.$transaction(async (tx) => {
        // First, deduct buy-ins from all human players
        await this.deductBuyIns(tx, humanPlayers, game.buyIn);
        
        // Then, distribute prizes to winners
        await this.distributePrizes(tx, game, winningTeamOrPlayer, humanPlayers);
      });

      console.log('[COIN MANAGER] Successfully processed coins for game:', game.dbGameId);
    } catch (error) {
      console.error('[COIN MANAGER ERROR] Failed to process coins for game:', game.dbGameId, error);
      // Remove from processed set so it can be retried
      this.processedGames.delete(game.dbGameId);
      throw error;
    }
  }

  /**
   * Deduct buy-ins from all human players
   */
  private static async deductBuyIns(tx: any, humanPlayers: any[], buyIn: number): Promise<void> {
    console.log('[COIN MANAGER] Deducting buy-ins from', humanPlayers.length, 'players');
    
    for (const player of humanPlayers) {
      try {
        const currentUser = await tx.user.findUnique({ 
          where: { id: player.id },
          select: { id: true, coins: true, username: true }
        });
        
        if (!currentUser) {
          console.error('[COIN MANAGER] User not found:', player.id);
          continue;
        }

        if (currentUser.coins < buyIn) {
          console.error('[COIN MANAGER] User does not have enough coins:', {
            userId: player.id,
            username: currentUser.username,
            currentCoins: currentUser.coins,
            requiredBuyIn: buyIn
          });
          continue;
        }

        const newBalance = currentUser.coins - buyIn;
        await tx.user.update({
          where: { id: player.id },
          data: { coins: newBalance }
        });

        console.log('[COIN MANAGER] Deducted buy-in from player:', {
          userId: player.id,
          username: currentUser.username,
          buyIn: buyIn,
          oldBalance: currentUser.coins,
          newBalance: newBalance
        });
      } catch (error) {
        console.error('[COIN MANAGER] Failed to deduct buy-in from player:', player.id, error);
        throw error;
      }
    }
  }

  /**
   * Distribute prizes to winners based on game mode
   */
  private static async distributePrizes(tx: any, game: Game, winningTeamOrPlayer: number, humanPlayers: any[]): Promise<void> {
    console.log('[COIN MANAGER] Distributing prizes for', game.gameMode, 'game');
    
    const buyIn = game.buyIn;
    const totalPot = buyIn * 4; // Total pot from all 4 players
    const rake = Math.floor(totalPot * 0.1); // 10% rake
    const prizePool = totalPot - rake; // 90% of pot goes to prizes

    if (game.gameMode === 'SOLO' || game.solo) {
      await this.distributeSoloPrizes(tx, game, winningTeamOrPlayer, humanPlayers, buyIn);
    } else {
      await this.distributePartnersPrizes(tx, game, winningTeamOrPlayer, humanPlayers, prizePool);
    }
  }

  /**
   * Distribute prizes for solo games
   * 1st place: 2.6x buy-in
   * 2nd place: 1x buy-in (buy-in back)
   * 3rd and 4th: nothing
   */
  private static async distributeSoloPrizes(tx: any, game: Game, winningPlayer: number, humanPlayers: any[], buyIn: number): Promise<void> {
    console.log('[COIN MANAGER] Distributing solo prizes, winner:', winningPlayer);
    
    // Get player scores to determine rankings
    const playerScores = game.playerScores || [0, 0, 0, 0];
    
    // Create array of players with their scores and positions
    const playersWithScores = playerScores.map((score, index) => ({ 
      score, 
      position: index,
      player: game.players[index]
    }));
    
    // Sort by score (highest first)
    playersWithScores.sort((a, b) => b.score - a.score);
    
    // Distribute prizes
    for (let rank = 0; rank < playersWithScores.length; rank++) {
      const { position, player } = playersWithScores[rank];
      
      if (!player || player.type !== 'human') continue;
      
      let prizeAmount = 0;
      if (rank === 0) {
        // 1st place gets 2.6x buy-in
        prizeAmount = Math.floor(buyIn * 2.6);
      } else if (rank === 1) {
        // 2nd place gets buy-in back
        prizeAmount = buyIn;
      }
      // 3rd and 4th place get nothing
      
      if (prizeAmount > 0) {
        await this.awardPrize(tx, player.id, prizeAmount, `Solo ${rank + 1}st place`);
      }
    }
  }

  /**
   * Distribute prizes for partners games
   * Winners split the prize pool (90% of total pot after rake)
   */
  private static async distributePartnersPrizes(tx: any, game: Game, winningTeam: number, humanPlayers: any[], prizePool: number): Promise<void> {
    console.log('[COIN MANAGER] Distributing partners prizes, winning team:', winningTeam);
    
    // Find all human players on the winning team
    const winningPlayers = humanPlayers.filter(player => player.team === winningTeam);
    
    if (winningPlayers.length === 0) {
      console.log('[COIN MANAGER] No human players on winning team');
      return;
    }
    
    // Each winner gets an equal share of the prize pool
    const prizePerWinner = Math.floor(prizePool / 2); // 2 winners per team
    
    for (const player of winningPlayers) {
      await this.awardPrize(tx, player.id, prizePerWinner, 'Partners winner');
    }
  }

  /**
   * Award prize to a player
   */
  private static async awardPrize(tx: any, userId: string, prizeAmount: number, reason: string): Promise<void> {
    try {
      const currentUser = await tx.user.findUnique({ 
        where: { id: userId },
        select: { id: true, coins: true, username: true }
      });
      
      if (!currentUser) {
        console.error('[COIN MANAGER] User not found for prize:', userId);
        return;
      }

      const newBalance = currentUser.coins + prizeAmount;
      await tx.user.update({
        where: { id: userId },
        data: { coins: newBalance }
      });

      console.log('[COIN MANAGER] Awarded prize to player:', {
        userId: userId,
        username: currentUser.username,
        prizeAmount: prizeAmount,
        reason: reason,
        oldBalance: currentUser.coins,
        newBalance: newBalance
      });
    } catch (error) {
      console.error('[COIN MANAGER] Failed to award prize to player:', userId, error);
      throw error;
    }
  }

  /**
   * Clear processed games (for testing purposes)
   */
  static clearProcessedGames(): void {
    this.processedGames.clear();
  }

  /**
   * Get list of processed games (for debugging)
   */
  static getProcessedGames(): string[] {
    return Array.from(this.processedGames);
  }
}
