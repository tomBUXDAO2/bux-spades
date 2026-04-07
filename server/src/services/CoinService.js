import { prisma } from '../config/database.js';
import { statsAttributionService } from './StatsAttributionService.js';

export class CoinService {
  static seatedHumanPlayers(game) {
    return game.players.filter(
      (p) => p.isHuman && !p.isSpectator && p.seatIndex != null && p.seatIndex >= 0 && p.seatIndex < 4
    );
  }

  /**
   * Build per-seat wallet user ids (original rated starters when Redis map exists).
   * One Redis read for owners; coinUserForSeat is sync after load.
   */
  static async buildSeatWallets(gameId, game) {
    const seated = this.seatedHumanPlayers(game);
    const owners = await statsAttributionService.getOwnersArray(gameId);
    const coinUserForSeat = (seatIndex) => {
      const pinned = owners && owners[seatIndex];
      if (pinned) return pinned;
      const seatedHere = seated.find((p) => p.seatIndex === seatIndex);
      return seatedHere?.userId || null;
    };
    const deductUserIds = new Set();
    for (let s = 0; s < 4; s++) {
      const uid = coinUserForSeat(s);
      if (uid) deductUserIds.add(uid);
    }
    return { coinUserForSeat, deductUserIds: [...deductUserIds] };
  }

  /**
   * Handle coin transactions for rated games at game end
   * Deducts buy-in from all players and pays winners in one transaction
   * @param {string} gameId - The game ID
   */
  static async handleGameCoins(gameId) {
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

      // Deduct buy-in from all players AND pay winners in one transaction
      await this.deductAndPay(game, buyIn);

      console.log(`[COIN SERVICE] Successfully handled coin transactions for rated game ${gameId}`);
    } catch (error) {
      console.error(`[COIN SERVICE] Error handling coins for game ${gameId}:`, error);
      throw error;
    }
  }

  /**
   * Deduct buy-in from all players and pay winners in one transaction
   * This ensures atomicity - either all transactions succeed or none do
   */
  static async deductAndPay(game, buyIn) {
    if (!game.result) {
      console.error(`[COIN SERVICE] No result found for game ${game.id}`);
      return;
    }

    const seatedHumans = this.seatedHumanPlayers(game);
    const { coinUserForSeat, deductUserIds } = await this.buildSeatWallets(game.id, game);

    console.log(
      `[COIN SERVICE] Processing coin transactions: ${deductUserIds.length} buy-in wallets, ${seatedHumans.length} seated humans`
    );

    // Use a database transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // Step 1: Deduct buy-in once per original wallet (seat owners), not per GamePlayer row
      for (const userId of deductUserIds) {
        await tx.user.update({
          where: { id: userId },
          data: {
            coins: { decrement: buyIn }
          }
        });

        console.log(`[COIN SERVICE] Deducted ${buyIn} coins from wallet user ${userId}`);
      }

      // Step 2: Pay winners based on game mode (credits go to seat owners, not substitutes)
      if (game.mode === 'PARTNERS') {
        await this.payPartnersWinnersInTx(tx, game, seatedHumans, buyIn, coinUserForSeat);
      } else {
        await this.paySoloWinnersInTx(tx, game, seatedHumans, buyIn, coinUserForSeat);
      }
    });

    console.log(`[COIN SERVICE] Successfully completed all coin transactions for game ${game.id}`);
  }

  /**
   * Pay partners game winners within transaction
   * Winners get 1.8x buy-in each, losers lose buy-in (already deducted)
   */
  static async payPartnersWinnersInTx(tx, game, seatedHumans, buyIn, coinUserForSeat) {
    const { result } = game;

    // Determine winning team
    const isTeam0Winner = result.team0Final > result.team1Final;
    const winningTeamIndex = isTeam0Winner ? 0 : 1;

    // Calculate winner payout (1.8x buy-in each)
    const winnerPayout = Math.floor(buyIn * 1.8);

    // Pay winners (seat wallet, so subs never receive)
    const winners = seatedHumans.filter((p) => p.teamIndex === winningTeamIndex);
    for (const winner of winners) {
      const payTo = coinUserForSeat(winner.seatIndex) || winner.userId;
      await tx.user.update({
        where: { id: payTo },
        data: {
          coins: { increment: winnerPayout }
        }
      });

      console.log(
        `[COIN SERVICE] Paid ${winnerPayout} coins to seat ${winner.seatIndex} wallet ${payTo} (actor ${winner.userId})`
      );
    }
  }

  /**
   * Pay solo game winners within transaction
   * 1st: 2.6x buy-in, 2nd: 1x buy-in, 3rd/4th: 0 coins
   */
  static async paySoloWinnersInTx(tx, game, seatedHumans, buyIn, coinUserForSeat) {
    const { result } = game;

    // Get individual player scores
    const playerScores = [
      { player: seatedHumans.find((p) => p.seatIndex === 0), score: result.player0Final || 0 },
      { player: seatedHumans.find((p) => p.seatIndex === 1), score: result.player1Final || 0 },
      { player: seatedHumans.find((p) => p.seatIndex === 2), score: result.player2Final || 0 },
      { player: seatedHumans.find((p) => p.seatIndex === 3), score: result.player3Final || 0 }
    ].filter((p) => p.player); // Remove null players

    // Sort by score (highest first)
    playerScores.sort((a, b) => b.score - a.score);

    // Calculate payouts
    const firstPayout = Math.floor(buyIn * 2.6);
    const secondPayout = buyIn;

    // Pay 1st place
    if (playerScores[0]) {
      const payTo =
        coinUserForSeat(playerScores[0].player.seatIndex) || playerScores[0].player.userId;
      await tx.user.update({
        where: { id: payTo },
        data: {
          coins: { increment: firstPayout }
        }
      });
      console.log(
        `[COIN SERVICE] Paid ${firstPayout} coins to 1st seat wallet ${payTo} (actor ${playerScores[0].player.userId})`
      );
    }

    // Pay 2nd place
    if (playerScores[1]) {
      const payTo =
        coinUserForSeat(playerScores[1].player.seatIndex) || playerScores[1].player.userId;
      await tx.user.update({
        where: { id: payTo },
        data: {
          coins: { increment: secondPayout }
        }
      });
      console.log(
        `[COIN SERVICE] Paid ${secondPayout} coins to 2nd seat wallet ${payTo} (actor ${playerScores[1].player.userId})`
      );
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
      const player = game.players.find(
        (p) => p.userId === userId && p.isHuman && !p.isSpectator && p.seatIndex != null
      );

      if (!player) {
        return 0;
      }

      const { coinUserForSeat } = await this.buildSeatWallets(gameId, game);
      const wallet = coinUserForSeat(player.seatIndex);
      if (wallet !== userId) {
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
    const playerPosition = playerScores.findIndex((p) => p.seatIndex === player.seatIndex) + 1;

    switch (playerPosition) {
      case 1:
        return Math.floor(buyIn * 2.6); // 1st place
      case 2:
        return buyIn; // 2nd place
      default:
        return 0; // 3rd/4th place
    }
  }
}
