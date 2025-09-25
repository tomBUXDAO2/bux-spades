import type { AuthenticatedSocket } from '../../socket-auth';
import { io } from '../../../index';
import { PrismaClient } from '@prisma/client';
import { GameChatMessage } from '../types/chatTypes';

const prisma = new PrismaClient();

/**
 * Handles game chat messages
 * Distinguishes between system messages and user messages
 */
export async function handleGameChatMessage(
  socket: AuthenticatedSocket,
  gameId: string,
  message: any
): Promise<void> {
  console.log('[CHAT DEBUG] handleGameChatMessage called with:', { gameId, message });
  if (!socket.isAuthenticated || !socket.userId) {
    socket.emit('error', { message: 'Not authenticated' });
    return;
  }

  try {
    // Check if this is a system message
    if (message.userId === 'system') {
      // System messages should be passed through as-is
      const systemMessage: GameChatMessage = {
        id: message.id || `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId: 'system',
        username: 'System',
        avatarUrl: undefined,
        message: message.message || '',
        timestamp: message.timestamp || new Date().toISOString(),
        isSystemMessage: true,
        gameId
      };

      // Broadcast system message to game room
      io.to(gameId).emit('chat_message', { gameId, message: systemMessage });
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
      avatarUrl: user.avatarUrl,
      message: typeof message === "string" ? message.trim() : message.message?.trim() || "",
      timestamp: new Date().toISOString(),
      isSystemMessage: false,
      gameId
    };

    // Broadcast user message to game room
    io.to(gameId).emit('chat_message', { gameId, message: chatMessage });
  } catch (error) {
    console.error('Error handling game chat message:', error);
    socket.emit('error', { message: 'Failed to send message' });
  }
}
