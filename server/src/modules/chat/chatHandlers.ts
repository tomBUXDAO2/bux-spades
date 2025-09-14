import { Socket } from 'socket.io';
import type { AuthenticatedSocket } from '../../index';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  avatar?: string;
  message: string;
  timestamp: string;
  isSystemMessage?: boolean;
}

export interface GameChatMessage extends ChatMessage {
  gameId: string;
}

export interface LobbyChatMessage extends ChatMessage {
  // Lobby-specific properties can be added here
}

/**
 * Handles game chat messages
 * Distinguishes between system messages and user messages
 */
export async function handleGameChatMessage(
  socket: AuthenticatedSocket,
  gameId: string,
  message: any
): Promise<void> {
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
        avatar: undefined,
        message: message.message || '',
        timestamp: message.timestamp || new Date().toISOString(),
        isSystemMessage: true,
        gameId
      };

      // Broadcast system message to game room
      socket.to(gameId).emit('chat_message', { gameId, message: systemMessage });
      return;
    }

    // Handle regular user messages
    const user = await prisma.user.findUnique({
      where: { id: socket.userId },
      select: { username: true, avatar: true }
    });

    if (!user) {
      socket.emit('error', { message: 'User not found' });
      return;
    }

    const chatMessage: GameChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: socket.userId,
      username: user.username,
      avatar: user.avatar,
      message: typeof message === "string" ? message.trim() : message.message?.trim() || "",
      timestamp: new Date().toISOString(),
      isSystemMessage: false,
      gameId
    };

    // Broadcast user message to game room
    socket.to(gameId).emit('chat_message', { gameId, message: chatMessage });
  } catch (error) {
    console.error('Error handling game chat message:', error);
    socket.emit('error', { message: 'Failed to send message' });
  }
}

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
      select: { username: true, avatar: true }
    });

    if (!user) {
      socket.emit('error', { message: 'User not found' });
      return;
    }

    const lobbyMessage: LobbyChatMessage = {
      id: message.id || `${socket.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: socket.userId,
      username: user.username,
      avatar: user.avatar,
      message: message.message.trim(),
      timestamp: message.timestamp || Date.now(),
      isSystemMessage: false
    };

    console.log("Broadcasting lobby message:", lobbyMessage);
    
    // Broadcast to all connected clients (lobby is global)
    socket.broadcast.emit("lobby_chat_message", lobbyMessage);
  } catch (error) {
    console.error('Error handling lobby chat message:', error);
    socket.emit('error', { message: 'Failed to send lobby message' });
  }
}

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
    avatar: undefined,
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
