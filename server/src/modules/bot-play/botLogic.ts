import type { Game } from "../../types/game";
import { io } from "../../index";
import { enrichGameForClient } from "../../routes/games/shared/gameUtils";
import prisma from "../../lib/prisma";

const BOT_USER_ID = 'bot-user-universal';

/**
 * Get the database user ID for a bot player
 */
function getBotDbUserId(player: any): string {
  return player.dbUserId || BOT_USER_ID;
}

/**
 * Makes a move for a bot player (bid or play card)
 */
export async function botMakeMove(game: Game, seatIndex: number): Promise<void> {
  const bot = game.players[seatIndex];
  if (!bot || bot.type !== 'bot') {
    console.log('[BOT DEBUG] botMakeMove called for non-bot or empty seat:', seatIndex);
    return;
  }

  console.log(`[BOT DEBUG] botMakeMove called for seat ${seatIndex} bot: ${bot.username} game.status: ${game.status}`);

  if (game.status === 'BIDDING') {
    // Bot bidding logic
    if (game.bidding && (game.bidding.bids[seatIndex] === null || typeof game.bidding.bids[seatIndex] === 'undefined')) {
      console.log(`[BOT DEBUG] Bot ${bot.username} is making a bid...`);
      
      // Simple bot bidding: random bid between 0-4
      const bid = Math.floor(Math.random() * 5);
      game.bidding.bids[seatIndex] = bid;
      console.log(`[BOT DEBUG] Bot ${bot.username} bid ${bid}`);

      // Persist RoundBid using universal bot user ID
      try {
        if (game.dbGameId) {
          let roundNumber = game.currentRound || 1;
          let roundRecord = await prisma.round.findFirst({ where: { gameId: game.dbGameId, roundNumber } });
          if (!roundRecord) {
            roundRecord = await prisma.round.create({
              data: {
                id: `round_${game.dbGameId}_${roundNumber}_${Date.now()}`,
                gameId: game.dbGameId,
                roundNumber,
                createdAt: new Date(),
                updatedAt: new Date()
              }
            });
          }
          await prisma.roundBid.upsert({
            where: {
              roundId_playerId: {
                roundId: roundRecord.id,
                playerId: getBotDbUserId(bot) // Use universal bot user ID
              }
            },
            update: { bid, isBlindNil: bid === -1 },
            create: {
              id: `bid_${roundRecord.id}_${seatIndex}_${Date.now()}`,
              roundId: roundRecord.id,
              playerId: getBotDbUserId(bot), // Use universal bot user ID
              bid,
              isBlindNil: bid === -1,
              createdAt: new Date()
            }
          });
        }
      } catch (err) {
        console.error('[BOT DEBUG] Failed to persist RoundBid for bot:', err);
      }
      
      // Emit game update to frontend
      io.to(game.id).emit("game_update", enrichGameForClient(game));      
      // Find next player who hasn't bid
      let next = (seatIndex + 1) % 4;
      while (next !== seatIndex && game.bidding.bids[next] !== null && game.bidding.bids[next] !== undefined) {
        next = (next + 1) % 4;
      }
      
      if (next === seatIndex) {
        // All players have bid, move to play phase
        console.log('[BIDDING COMPLETE - BOT] Moving to play phase, first player:', game.players[0]?.username);
        game.status = 'PLAYING';
        game.play = {
          currentPlayer: game.players[0]?.id || '',
          currentPlayerIndex: 0,
          tricks: [],
          trickNumber: 0,
          currentTrick: [],
          spadesBroken: false
        };
        
        
        // Emit game update when bidding completes
        io.to(game.id).emit("game_update", enrichGameForClient(game));        // Start first trick
        if (game.players[0] && game.players[0].type === 'bot') {
          setTimeout(() => botMakeMove(game, 0), 1000);
        }
      } else {
        // Move to next player
        game.bidding.currentBidderIndex = next;
        game.bidding.currentPlayer = game.players[next]?.id || '';
        
        // Emit game update when moving to next bidder
        io.to(game.id).emit("game_update", enrichGameForClient(game));        
        if (game.players[next] && game.players[next].type === 'bot') {
          setTimeout(() => botMakeMove(game, next), 1000);
        }
      }
    }
  } else if (game.status === 'PLAYING') {
    // Bot card playing logic
    if (game.play && game.play.currentPlayer === bot.id) {
      console.log(`[BOT DEBUG] Bot ${bot.username} is playing a card...`);
      
      if (bot.hand && bot.hand.length > 0) {
        // Simple bot logic: play first card in hand
        const cardToPlay = bot.hand[0];
        bot.hand.splice(0, 1);
        
        // Add to current trick
        if (!game.play.currentTrick) {
          game.play.currentTrick = [];
        }
        game.play.currentTrick.push({
          ...cardToPlay,
          playerIndex: seatIndex
        });
        
        console.log(`[BOT DEBUG] Bot ${bot.username} played ${cardToPlay.suit} ${cardToPlay.rank}`);
        
        // Check if trick is complete
        if (game.play.currentTrick.length === 4) {
          // Trick complete - determine winner and start next trick
          const winnerIndex = determineTrickWinner(game.play.currentTrick);
          const winner = game.players[winnerIndex];
          
          if (winner) {
            winner.tricks = (winner.tricks || 0) + 1;
          }
          
          // Add to tricks history
          game.play.tricks.push({
            cards: [...game.play.currentTrick],
            winnerIndex
          });
          
          game.play.trickNumber++;
          game.play.currentTrick = [];
          game.play.currentPlayer = winner?.id || '';
          game.play.currentPlayerIndex = winnerIndex;
          
          // Check if round is complete
          if (game.play.trickNumber >= 13) {
            console.log('[BOT DEBUG] Round complete, calculating scores...');
            // Round complete - calculate scores and start next round or end game
            game.status = 'WAITING';
          }
        } else {
          // Move to next player
          const nextPlayerIndex = (seatIndex + 1) % 4;
          game.play.currentPlayer = game.players[nextPlayerIndex]?.id || '';
          game.play.currentPlayerIndex = nextPlayerIndex;
          
          if (game.players[nextPlayerIndex] && game.players[nextPlayerIndex].type === 'bot') {
            setTimeout(() => botMakeMove(game, nextPlayerIndex), 1000);
          }
        }
      }
    }
  }
}

/**
 * Simple trick winner determination
 */
function determineTrickWinner(trick: any[]): number {
  // For now, just return the first player (simple logic)
  return trick[0].playerIndex;
}
