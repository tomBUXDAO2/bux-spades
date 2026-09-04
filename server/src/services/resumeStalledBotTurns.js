import { prisma } from '../config/database.js';
import { BiddingHandler } from '../modules/socket-handlers/bidding/biddingHandler.js';
import { CardPlayHandler } from '../modules/socket-handlers/card-play/cardPlayHandler.js';

/**
 * After deploy/restart, in-memory timers and pending bot actions are gone.
 * Kick bot turns for any active game whose currentPlayer is a bot.
 */
export async function resumeStalledBotTurns(io) {
  try {
    const games = await prisma.game.findMany({
      where: { status: { in: ['BIDDING', 'PLAYING'] } },
      select: {
        id: true,
        status: true,
        currentPlayer: true,
        players: {
          where: { isSpectator: false },
          select: {
            userId: true,
            isHuman: true,
            seatIndex: true,
            user: { select: { username: true } }
          }
        }
      }
    });

    if (!games.length) {
      console.log('[RESUME TURNS] No active BIDDING/PLAYING games');
      return;
    }

    console.log(`[RESUME TURNS] Checking ${games.length} active game(s) for stalled bot turns`);

    for (const game of games) {
      if (!game.currentPlayer) continue;
      const current = game.players.find((p) => p.userId === game.currentPlayer);
      if (!current) continue;

      const looksLikeBot =
        current.isHuman === false ||
        (current.user?.username && String(current.user.username).startsWith('Bot_'));

      // BIDDING: always run bot-bid recovery — it also advances if currentPlayer
      // already bid but the pointer never moved (common after deploy/sub).
      if (game.status === 'BIDDING') {
        console.log(
          `[RESUME TURNS] Recovering bidding for ${game.id} (current seat ${current.seatIndex}, ${current.user?.username})`
        );
        const biddingHandler = new BiddingHandler(io, null);
        setTimeout(() => {
          biddingHandler.triggerBotBidIfNeeded(game.id).catch((err) => {
            console.error(`[RESUME TURNS] Bid recover failed for ${game.id}:`, err?.message || err);
          });
        }, 500);
        continue;
      }

      if (!looksLikeBot) continue;

      console.log(
        `[RESUME TURNS] Resuming PLAYING bot turn in ${game.id} (seat ${current.seatIndex}, ${current.user?.username})`
      );

      const cardPlayHandler = new CardPlayHandler(io, null);
      setTimeout(() => {
        cardPlayHandler.triggerBotPlayIfNeeded(game.id).catch((err) => {
          console.error(`[RESUME TURNS] Bot play failed for ${game.id}:`, err?.message || err);
        });
      }, 500);
    }
  } catch (e) {
    console.error('[RESUME TURNS] Failed:', e?.message || e);
  }
}
