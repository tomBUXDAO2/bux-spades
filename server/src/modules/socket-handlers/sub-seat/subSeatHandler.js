import { randomUUID } from 'crypto';
import { prisma } from '../../../config/database.js';
import { GameService } from '../../../services/GameService.js';
import redisGameState from '../../../services/RedisGameStateService.js';
import { subSeatService, subSeatPendingTimers } from '../../../services/SubSeatService.js';
import { gamePresenceService } from '../../../services/GamePresenceService.js';
import { statsAttributionService } from '../../../services/StatsAttributionService.js';
import { emitPersonalizedGameEvent } from '../../../services/SocketGameBroadcastService.js';
import { scheduleHumanBiddingTurn, scheduleHumanPlayingTurn } from '../../../services/humanTurnScheduler.js';
import { playerTimerService } from '../../../services/PlayerTimerService.js';
import redisSessionService from '../../../services/RedisSessionService.js';

async function resolveApproverUserId(game, gameState, gameId, seatIndex) {
  if (game.mode === 'SOLO') {
    return game.createdById;
  }
  const partnerSeat = (seatIndex + 2) % 4;
  const partner = (gameState.players || []).find((p) => p && p.seatIndex === partnerSeat);
  if (!partner) {
    return game.createdById;
  }
  const isBot = partner.type === 'bot' || partner.isHuman === false;
  if (isBot) {
    return game.createdById;
  }
  const pid = partner.userId || partner.id;
  if (!pid) {
    return game.createdById;
  }
  if (await gamePresenceService.isAway(gameId, pid)) {
    return game.createdById;
  }
  return pid;
}

function clearSeatTimer(gameId) {
  try {
    playerTimerService.clearTimer(gameId);
  } catch {}
}

export async function runSubSeatRequestTimeout(gameId, requestId, io) {
  try {
    const pending = await subSeatService.getPending(gameId);
    if (!pending || pending.requestId !== requestId) {
      return;
    }
    await subSeatService.clearPending(gameId);
    subSeatPendingTimers.delete(gameId);
    await subSeatService.addBlock(gameId, pending.spectatorUserId, pending.seatIndex);
    io.to(gameId).emit('sub_seat_resolved', {
      gameId,
      seatIndex: pending.seatIndex,
      approved: false,
      timedOut: true,
      spectatorUserId: pending.spectatorUserId
    });
  } catch (e) {
    console.error('[SUB SEAT] Timeout handler error:', e);
  }
}

async function executeApprovedSwap(io, gameId, pending) {
  const { spectatorUserId, seatIndex } = pending;

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      currentPlayer: true,
      status: true,
      isRated: true,
      mode: true,
      createdById: true,
      currentRound: true
    }
  });
  if (!game) {
    throw new Error('Game not found');
  }

  const spectatorGp = await prisma.gamePlayer.findFirst({
    where: { gameId, userId: spectatorUserId, isSpectator: true }
  });
  const targetGp = await prisma.gamePlayer.findFirst({
    where: { gameId, seatIndex, isSpectator: false }
  });

  if (!spectatorGp || !targetGp) {
    throw new Error('Invalid players for swap');
  }

  const targetUserId = targetGp.userId;
  const isBot = !targetGp.isHuman;
  const wasTargetsTurn = game.currentPlayer === targetUserId;

  if (game.isRated) {
    await statsAttributionService.pinSeatOwnerIfRated(gameId, seatIndex, targetUserId);
  }

  const teamIndex = game.mode === 'SOLO' ? seatIndex : seatIndex % 2;

  let activeRoundId = null;
  if (game.currentRound != null) {
    const r = await prisma.round.findUnique({
      where: {
        gameId_roundNumber: { gameId, roundNumber: game.currentRound }
      },
      select: { id: true }
    });
    activeRoundId = r?.id ?? null;
  }

  await prisma.$transaction(async (tx) => {
    if (isBot && activeRoundId) {
      const migrated = await tx.playerRoundStats.updateMany({
        where: { roundId: activeRoundId, userId: targetUserId },
        data: { userId: spectatorUserId, seatIndex, teamIndex }
      });
      if (migrated.count === 0) {
        await tx.playerRoundStats.create({
          data: {
            roundId: activeRoundId,
            userId: spectatorUserId,
            seatIndex,
            teamIndex,
            bid: null,
            isBlindNil: false,
            tricksWon: 0,
            bagsThisRound: 0,
            madeNil: false,
            madeBlindNil: false
          }
        });
      }
    }

    if (isBot) {
      await tx.gamePlayer.delete({ where: { id: targetGp.id } });
      await tx.user.deleteMany({ where: { id: targetUserId } }).catch(() => {});
    } else {
      await tx.gamePlayer.update({
        where: { id: targetGp.id },
        data: { isSpectator: true, seatIndex: null, teamIndex: null }
      });
    }

    await tx.gamePlayer.update({
      where: { id: spectatorGp.id },
      data: {
        isSpectator: false,
        seatIndex,
        teamIndex,
        isHuman: true,
        leftAt: null
      }
    });

    if (wasTargetsTurn) {
      await tx.game.update({
        where: { id: gameId },
        data: { currentPlayer: spectatorUserId }
      });
    }
  });

  if (game.isRated && isBot) {
    const owners = await statsAttributionService.getOwnersArray(gameId);
    if (owners && owners[seatIndex] === targetUserId) {
      const next = [...owners];
      next[seatIndex] = spectatorUserId;
      await statsAttributionService.setOwnersArray(gameId, next);
    }
  }

  clearSeatTimer(gameId);

  const fullGameState = await GameService.getFullGameStateFromDatabase(gameId);
  if (fullGameState) {
    await redisGameState.setGameState(gameId, fullGameState);
  }

  await redisSessionService.updateActiveGame(spectatorUserId, gameId);

  const fresh = await GameService.getGame(gameId);
  const subPlayer = fresh?.players?.find((p) => p.userId === spectatorUserId && !p.isSpectator);
  if (wasTargetsTurn && subPlayer) {
    if (game.status === 'BIDDING') {
      await scheduleHumanBiddingTurn(io, gameId, subPlayer, fullGameState || fresh);
    } else if (game.status === 'PLAYING') {
      await scheduleHumanPlayingTurn(gameId, subPlayer);
    }
  }

  const updatedGameState = await GameService.getGameStateForClient(gameId);
  if (updatedGameState) {
    emitPersonalizedGameEvent(io, gameId, 'game_update', updatedGameState);
  }
}

export class SubSeatHandler {
  constructor(io, socket) {
    this.io = io;
    this.socket = socket;
  }

  async handleRequestSubSeat(data) {
    const userId = this.socket.userId || data?.userId;
    const gameId = data?.gameId;
    const seatIndex = data?.seatIndex;

    if (!userId) {
      this.socket.emit('error', { message: 'Not authenticated' });
      return;
    }
    if (!gameId || seatIndex == null || seatIndex < 0 || seatIndex > 3) {
      this.socket.emit('error', { message: 'Invalid request' });
      return;
    }

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        status: true,
        mode: true,
        createdById: true,
        isRated: true,
        currentPlayer: true
      }
    });

    if (!game || !['BIDDING', 'PLAYING'].includes(game.status)) {
      this.socket.emit('error', { message: 'Cannot request seat in this game state' });
      return;
    }

    const spec = await prisma.gamePlayer.findFirst({
      where: { gameId, userId, isSpectator: true }
    });
    if (!spec) {
      this.socket.emit('error', { message: 'Only spectators can request a seat' });
      return;
    }

    if (await subSeatService.isBlocked(gameId, userId, seatIndex)) {
      this.socket.emit('error', { message: 'You cannot request this seat again' });
      return;
    }

    if (await subSeatService.getPending(gameId)) {
      this.socket.emit('error', { message: 'Another seat request is pending' });
      return;
    }

    const gameState = await GameService.getGameStateForClient(gameId);
    if (!gameState?.players) {
      this.socket.emit('error', { message: 'Game state unavailable' });
      return;
    }

    const players = gameState.players || [];
    const target = Array.isArray(players)
      ? players.find((p) => p && p.seatIndex === seatIndex)
      : null;
    if (!target) {
      this.socket.emit('error', { message: 'Seat is empty' });
      return;
    }

    const isBot = target.type === 'bot' || target.isHuman === false;
    const awayHuman =
      !isBot &&
      (await gamePresenceService.isAway(gameId, target.userId || target.id));

    if (!isBot && !awayHuman) {
      this.socket.emit('error', { message: 'Seat must be a bot or an away player' });
      return;
    }

    const approverUserId = await resolveApproverUserId(game, gameState, gameId, seatIndex);

    const requestId = randomUUID();
    const spectatorUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true }
    });

    const pending = {
      requestId,
      spectatorUserId: userId,
      spectatorUsername: spectatorUser?.username || 'Player',
      seatIndex,
      approverUserId,
      targetUserId: target.userId || target.id
    };

    await subSeatService.setPending(gameId, pending);

    const prev = subSeatPendingTimers.get(gameId);
    if (prev?.timeoutId) {
      clearTimeout(prev.timeoutId);
    }
    const timeoutId = setTimeout(() => {
      runSubSeatRequestTimeout(gameId, requestId, this.io);
    }, 10000);
    subSeatPendingTimers.set(gameId, { timeoutId, requestId });

    this.io.to(gameId).emit('sub_seat_request', {
      gameId,
      requestId,
      seatIndex,
      spectatorUserId: userId,
      spectatorUsername: pending.spectatorUsername,
      approverUserId,
      expiresAt: Date.now() + 10000
    });
  }

  async handleRespondSubSeat(data) {
    const userId = this.socket.userId || data?.userId;
    const gameId = data?.gameId;
    const approved = Boolean(data?.approved);

    if (!userId) {
      this.socket.emit('error', { message: 'Not authenticated' });
      return;
    }
    if (!gameId) {
      this.socket.emit('error', { message: 'Game ID required' });
      return;
    }

    const pending = await subSeatService.getPending(gameId);
    if (!pending) {
      this.socket.emit('error', { message: 'No pending seat request' });
      return;
    }
    if (pending.approverUserId !== userId) {
      this.socket.emit('error', { message: 'You cannot respond to this request' });
      return;
    }

    const prev = subSeatPendingTimers.get(gameId);
    if (prev?.timeoutId) {
      clearTimeout(prev.timeoutId);
    }
    subSeatPendingTimers.delete(gameId);
    await subSeatService.clearPending(gameId);

    if (!approved) {
      await subSeatService.addBlock(gameId, pending.spectatorUserId, pending.seatIndex);
      this.io.to(gameId).emit('sub_seat_resolved', {
        gameId,
        seatIndex: pending.seatIndex,
        approved: false,
        timedOut: false,
        spectatorUserId: pending.spectatorUserId
      });
      return;
    }

    try {
      await executeApprovedSwap(this.io, gameId, pending);
      this.io.to(gameId).emit('sub_seat_resolved', {
        gameId,
        seatIndex: pending.seatIndex,
        approved: true,
        spectatorUserId: pending.spectatorUserId
      });
    } catch (e) {
      console.error('[SUB SEAT] executeApprovedSwap failed:', e);
      this.socket.emit('error', { message: 'Failed to approve seat swap' });
    }
  }
}
