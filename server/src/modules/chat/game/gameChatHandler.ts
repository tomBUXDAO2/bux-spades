import type { AuthenticatedSocket } from '../../socket-auth';
import { io } from '../../../index';
import { PrismaClient } from '@prisma/client';
import { GameChatMessage } from '../types/chatTypes';

const prisma = new PrismaClient();
    console.log('[CHAT DEBUG] Prisma client created');

/**
 * Handles game chat messages
 * Distinguishes between system messages and user messages
 */
export async function handleGameChatMessage(
  socket: AuthenticatedSocket,
  gameId: string,
  message: any
): Promise<void> {
  console.log('[CHAT DEBUG] handleGameChatMessage called with:');
    console.log('[CHAT DEBUG] Function called successfully');
    console.log('[CHAT DEBUG] Data:');
    console.log({ gameId, message });
  if (!socket.isAuthenticated || !socket.userId) {
    socket.emit('error', { message: 'Not authenticated' });
    return;
  }

  try {
    // Ensure the sender is in the game room (idempotent)
    try {
      await socket.join(gameId);
      console.log('[CHAT DEBUG] Ensured socket joined room:', gameId);
    } catch (joinErr) {
      console.warn('[CHAT DEBUG] Failed to join room (non-fatal):', joinErr);
    }

    // Check if this is a system message
    if (message.userId === 'system') {
      // System messages should be passed through as-is
      const systemMessage: GameChatMessage = {
        id: message.id || `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId: 'system',
        username: 'System',
        avatar: undefined,
        message: message.message || '',
        timestamp: message.timestamp || new Date().toISOString(),
        isSystemMessage: true,
        gameId
      };

      // Send to others and echo once to sender (avoid double-send)
      socket.to(gameId).emit('chat_message', { gameId, message: systemMessage });
      socket.emit('chat_message', { gameId, message: systemMessage });
      return;
    }

    // Handle regular user messages
    const user = await prisma.user.findUnique({
      where: { id: socket.userId },
      select: { username: true, avatarUrl: true }
    });

    if (!user) {
      socket.emit('error', { message: 'User not found' });
      return;
    }

    const chatMessage: GameChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: socket.userId,
      username: user.username,
      avatar: user.avatarUrl,
      message: typeof message === "string" ? message.trim() : message.message?.trim() || "",
      timestamp: new Date().toISOString(),
      isSystemMessage: false,
      gameId
    };

    console.log('[CHAT DEBUG] Broadcasting message to game room:');
    console.log('[CHAT DEBUG] Game room:');
    console.log(gameId);
    console.log('[CHAT DEBUG] Message:');
    console.log(chatMessage);
    // Send to others and echo once to sender (avoid double-send)
    socket.to(gameId).emit('chat_message', { gameId, message: chatMessage });
    socket.emit('chat_message', { gameId, message: chatMessage });
  } catch (error) {
    console.error('Error handling game chat message:', error);
    socket.emit('error', { message: 'Failed to send message' });
  }
}
