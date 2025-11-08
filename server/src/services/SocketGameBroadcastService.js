import { GameService } from './GameService.js';

/**
 * Emit a personalised game event to every socket in a room.
 *
 * @param {import('socket.io').Server} io - The socket.io server instance.
 * @param {string} gameId - The game room identifier.
 * @param {string} eventName - The socket event to emit.
 * @param {object} baseGameState - The unsanitised game state to broadcast.
 * @param {object} [options]
 * @param {object} [options.extraPayload] - Additional payload fields merged into each emit.
 * @param {string} [options.excludeSocketId] - Optional socket id to skip (e.g. caller already notified).
 * @param {boolean} [options.includeSpectators=true] - Whether to emit to sockets without a userId.
 */
export function emitPersonalizedGameEvent(io, gameId, eventName, baseGameState, options = {}) {
  if (!io || !gameId || !eventName || !baseGameState) {
    return;
  }

  const {
    extraPayload = {},
    excludeSocketId,
    includeSpectators = true
  } = options;

  const room = io?.sockets?.adapter?.rooms?.get(gameId);
  if (!room) {
    return;
  }

  for (const socketId of room) {
    if (excludeSocketId && socketId === excludeSocketId) {
      continue;
    }

    const socket = io.sockets.sockets.get(socketId);
    if (!socket) {
      continue;
    }

    if (!socket.userId && !includeSpectators) {
      continue;
    }

    const personalizedState = GameService.sanitizeGameStateForUser(
      baseGameState,
      socket.userId || null
    );

    socket.emit(eventName, {
      gameId,
      gameState: personalizedState,
      ...extraPayload
    });
  }
}

/**
 * Emit a personalised game event to a single socket (helper for clarity).
 *
 * @param {import('socket.io').Socket} socket
 * @param {string} eventName
 * @param {string} gameId
 * @param {object} baseGameState
 * @param {object} [extraPayload]
 */
export function emitPersonalizedGameEventToSocket(socket, eventName, gameId, baseGameState, extraPayload = {}) {
  if (!socket || !eventName || !gameId || !baseGameState) {
    return;
  }

  const personalizedState = GameService.sanitizeGameStateForUser(
    baseGameState,
    socket.userId || null
  );

  socket.emit(eventName, {
    gameId,
    gameState: personalizedState,
    ...extraPayload
  });
}

