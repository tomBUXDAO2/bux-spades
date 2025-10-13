import { prisma } from '../../../config/databaseFirst.js';

class LobbyChatHandler {
  // CRITICAL: Static Set shared across ALL instances to track online users
  static connectedUsers = new Set();
  
  constructor(io, socket) {
    this.io = io;
    this.socket = socket;
  }

  async handleLobbyMessage(data) {
    try {
      const { message } = data;
      const userId = this.socket.userId;

      if (!userId) {
        this.socket.emit('error', { message: 'User not authenticated' });
        return;
      }

      if (!message || message.trim().length === 0) {
        this.socket.emit('error', { message: 'Message cannot be empty' });
        return;
      }

      // Get user information
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, avatarUrl: true }
      });

      if (!user) {
        this.socket.emit('error', { message: 'User not found' });
        return;
      }

      const chatMessage = {
        id: `lobby_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: user.id,
        userName: user.username,
        userAvatar: user.avatarUrl,
        message: message.trim(),
        timestamp: Date.now(),
        isLobbyMessage: true
      };

      // Broadcast to all connected users in lobby
      this.io.emit('lobby_chat_message', chatMessage);
      console.log(`[LOBBY CHAT] User ${user.username} sent message: ${message}`);

    } catch (error) {
      console.error('[LOBBY CHAT] Error handling message:', error);
      this.socket.emit('error', { message: 'Failed to send message' });
    }
  }

  // Handle user coming online
  async handleUserOnline() {
    try {
      const userId = this.socket.userId;
      if (!userId) return;

      // Add user to connected users (static Set)
      LobbyChatHandler.connectedUsers.add(userId);

      // Get user info
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, avatarUrl: true }
      });

      if (user) {
        // Broadcast updated online users list to all clients
        const onlineUserIds = Array.from(LobbyChatHandler.connectedUsers);
        this.io.emit('online_users', onlineUserIds);
        console.log(`[LOBBY] User ${user.username} came online. Total online: ${onlineUserIds.length}`);
      }

    } catch (error) {
      console.error('[LOBBY] Error handling user online:', error);
    }
  }

  // Handle user going offline
  async handleUserOffline() {
    try {
      const userId = this.socket.userId;
      if (!userId) return;

      // Remove user from connected users (static Set)
      LobbyChatHandler.connectedUsers.delete(userId);

      // Broadcast updated online users list to all clients
      const onlineUserIds = Array.from(LobbyChatHandler.connectedUsers);
      this.io.emit('online_users', onlineUserIds);
      console.log(`[LOBBY] User went offline. Total online: ${onlineUserIds.length}`);

    } catch (error) {
      console.error('[LOBBY] Error handling user offline:', error);
    }
  }

  // Get current online users
  getOnlineUsers() {
    return Array.from(LobbyChatHandler.connectedUsers);
  }
}

export { LobbyChatHandler };
