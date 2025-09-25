import { GameChatMessage } from '../types/chatTypes';

/**
 * Creates a system message for game events
 */
export function createSystemMessage(
  gameId: string,
  message: string,
  eventType?: string
): GameChatMessage {
  return {
    id: `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId: 'system',
    username: 'System',
    avatarUrl: undefined,
    message,
    timestamp: new Date().toISOString(),
    isSystemMessage: true,
    gameId
  };
}

/**
 * Broadcasts a system message to a game room
 */
export function broadcastSystemMessage(
  io: any,
  gameId: string,
  message: string,
  eventType?: string
): void {
  const systemMessage = createSystemMessage(gameId, message, eventType);
  io.to(gameId).emit('chat_message', { gameId, message: systemMessage });
}
