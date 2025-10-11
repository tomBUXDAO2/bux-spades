import { prisma } from '../config/database.js';

export class CoinService {
  
  /**
   * Handle coin transactions for rated games
   * @param {string} gameId - The game ID
   * @param {string} action - 'deduct' or 'pay'
   */
  static async handleGameCoins(gameId, action = 'deduct') {
    try {
      // Get game details with players
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          players: {
            include: {
              user: true
            }
          },
          result: true
        }
      });

      if (!game) {
        console.error(`[COIN SERVICE] Game ${gameId} not found`);
        return;
      }

      // Only handle coins for rated games
      if (!game.isRated) {
        console.log(`[COIN SERVICE] Skipping coin handling for non-rated game ${gameId}`);
        return;
      }

      const buyIn = game.buyIn || 0;
      if (buyIn <= 0) {
        console.log(`[COIN SERVICE] No buy-in amount for game ${gameId}`);
        return;
      }

      if (action === 'deduct') {
        await this.deductBuyIn(game, buyIn);
      } else if (action === 'pay') {
        await this.payWinners(game, buyIn);
      }

      console.log(`[COIN SERVICE] Successfully handled ${action} for rated game ${gameId}`);
    } catch (error) {
      console.error(`[COIN SERVICE] Error handling coins for game ${gameId}:`, error);
      throw error;
    }
  }

  /**
   * Deduct buy-in from all human players at game start
   */
  static async deductBuyIn(game, buyIn) {
    const humanPlayers = game.players.filter(p => p.isHuman);
    
    console.log(`[COIN SERVICE] Deducting ${buyIn} coins from ${humanPlayers.length} players`);
    
    // Deduct coins from all human players
    for (const player of humanPlayers) {
      await prisma.user.update({
        where: { id: player.userId },
        data: {
          coins: { decrement: buyIn }
        }
      });
      
      console.log(`[COIN SERVICE] Deducted ${buyIn} coins from ${player.user.username}`);
    }
  }

  /**
   * Pay winners based on game results
   */
  static async payWinners(game, buyIn) {
    if (!game.result) {
      console.error(`[COIN SERVICE] No result found for game ${gameId}`);
      return;
    }

    const humanPlayers = game.players.filter(p => p.isHuman);
    
    if (game.mode === 'PARTNERS') {
      await this.payPartnersWinners(game, humanPlayers, buyIn);
    } else {
      await this.paySoloWinners(game, humanPlayers, buyIn);
    }
  }

  /**
   * Pay partners game winners
   * Winners get 1.8x buy-in each, losers lose buy-in (already deducted)
   */
  static async payPartnersWinners(game, humanPlayers, buyIn) {
    const { result } = game;
    
    // Determine winning team
    const isTeam0Winner = result.team0Final > result.team1Final;
    const winningTeamIndex = isTeam0Winner ? 0 : 1;
    
    // Calculate winner payout (1.8x buy-in each)
    const winnerPayout = Math.floor(buyIn * 1.8);
    
    // Pay winners
    const winners = humanPlayers.filter(p => p.teamIndex === winningTeamIndex);
    for (const winner of winners) {
      await prisma.user.update({
        where: { id: winner.userId },
        data: {
          coins: { increment: winnerPayout }
        }
      });
      
      console.log(`[COIN SERVICE] Paid ${winnerPayout} coins to winner ${winner.user.username}`);
    }
  }

  /**
   * Pay solo game winners
   * 1st: 2.6x buy-in, 2nd: 1x buy-in, 3rd/4th: 0 coins
   */
  static async paySoloWinners(game, humanPlayers, buyIn) {
    const { result } = game;
    
    // Get individual player scores
    const playerScores = [
      { player: humanPlayers.find(p => p.seatIndex === 0), score: result.player0Final || 0 },
      { player: humanPlayers.find(p => p.seatIndex === 1), score: result.player1Final || 0 },
      { player: humanPlayers.find(p => p.seatIndex === 2), score: result.player2Final || 0 },
      { player: humanPlayers.find(p => p.seatIndex === 3), score: result.player3Final || 0 }
    ].filter(p => p.player); // Remove null players

    // Sort by score (highest first)
    playerScores.sort((a, b) => b.score - a.score);

    // Calculate payouts
    const firstPayout = Math.floor(buyIn * 2.6);
    const secondPayout = buyIn;
    
    // Pay 1st place
    if (playerScores[0]) {
      await prisma.user.update({
        where: { id: playerScores[0].player.userId },
        data: {
          coins: { increment: firstPayout }
        }
      });
      console.log(`[COIN SERVICE] Paid ${firstPayout} coins to 1st place ${playerScores[0].player.user.username}`);
    }
    
    // Pay 2nd place
    if (playerScores[1]) {
      await prisma.user.update({
        where: { id: playerScores[1].player.userId },
        data: {
          coins: { increment: secondPayout }
        }
      });
      console.log(`[COIN SERVICE] Paid ${secondPayout} coins to 2nd place ${playerScores[1].player.user.username}`);
    }
    
    // 3rd/4th place get nothing (already deducted)
    console.log(`[COIN SERVICE] 3rd/4th place players get no payout`);
  }

  /**
   * Get coin winnings for display in modals
   */
  static async getCoinWinnings(gameId, userId) {
    try {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          players: {
            include: {
              user: true
            }
          },
          result: true
        }
      });

      if (!game || !game.isRated || !game.result) {
        return 0;
      }

      const buyIn = game.buyIn || 0;
      const player = game.players.find(p => p.userId === userId && p.isHuman);
      
      if (!player) {
        return 0;
      }

      if (game.mode === 'PARTNERS') {
        return this.getPartnersWinnings(game, player, buyIn);
      } else {
        return this.getSoloWinnings(game, player, buyIn);
      }
    } catch (error) {
      console.error(`[COIN SERVICE] Error getting coin winnings:`, error);
      return 0;
    }
  }

  static getPartnersWinnings(game, player, buyIn) {
    const { result } = game;
    const isTeam0Winner = result.team0Final > result.team1Final;
    const isPlayerWinner = player.teamIndex === (isTeam0Winner ? 0 : 1);
    
    return isPlayerWinner ? Math.floor(buyIn * 1.8) : 0;
  }

  static getSoloWinnings(game, player, buyIn) {
    const { result } = game;
    
    // Get all player scores
    const playerScores = [
      { seatIndex: 0, score: result.player0Final || 0 },
      { seatIndex: 1, score: result.player1Final || 0 },
      { seatIndex: 2, score: result.player2Final || 0 },
      { seatIndex: 3, score: result.player3Final || 0 }
    ];

    // Sort by score and find player's position
    playerScores.sort((a, b) => b.score - a.score);
    const playerPosition = playerScores.findIndex(p => p.seatIndex === player.seatIndex) + 1;
    
    switch (playerPosition) {
      case 1: return Math.floor(buyIn * 2.6); // 1st place
      case 2: return buyIn; // 2nd place
      default: return 0; // 3rd/4th place
    }
  }
}
