import type { AuthenticatedSocket } from '../../socket-auth';
import { io } from '../../../index';
import { prisma } from '../../../lib/prisma';
import { LobbyChatMessage } from '../types/chatTypes';

/**
 * Handles lobby chat messages
 */
export async function handleLobbyChatMessage(
  socket: AuthenticatedSocket,
  message: any
): Promise<void> {
  if (!socket.isAuthenticated || !socket.userId) {
    socket.emit('error', { message: 'Not authenticated' });
    return;
  }

  if (!message || !message.message) {
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: socket.userId },
      select: { username: true, avatarUrl: true }
    });

    if (!user) {
      socket.emit('error', { message: 'User not found' });
      return;
    }

    const lobbyMessage: LobbyChatMessage = {
      id: message.id || `${socket.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: socket.userId,
      username: user.username,
      avatar: user.avatarUrl,
      message: message.message.trim(),
      timestamp: message.timestamp || Date.now(),
      isSystemMessage: false
    };

    
    // Broadcast to all connected clients (lobby is global)
    io.emit("lobby_chat_message", lobbyMessage);
  } catch (error) {
    console.error('Error handling lobby chat message:', error);
    socket.emit('error', { message: 'Failed to send lobby message' });
  }
}
