import { prisma } from '../../../config/databaseFirst.js';

class FriendBlockHandler {
  constructor(io, socket) {
    this.io = io;
    this.socket = socket;
  }

  async handleAddFriend(data) {
    try {
      const { targetUserId } = data;
      const userId = this.socket.userId;

      if (!userId || !targetUserId || userId === targetUserId) {
        this.socket.emit('error', { message: 'Invalid request' });
        return;
      }

      // Check if already friends
      const existing = await prisma.friend.findFirst({
        where: {
          userId: userId,
          friendId: targetUserId
        }
      });

      if (existing) {
        this.socket.emit('friendAdded', { targetUserId });
        return;
      }

      // Create friendship
      await prisma.friend.create({
        data: {
          userId: userId,
          friendId: targetUserId,
          updatedAt: new Date()
        }
      });

      this.socket.emit('friendAdded', { targetUserId });

    } catch (error) {
      console.error('[FRIENDS] Error:', error.message);
      this.socket.emit('error', { message: 'Failed to add friend' });
    }
  }

  async handleRemoveFriend(data) {
    try {
      const { targetUserId } = data;
      const userId = this.socket.userId;

      if (!userId) {
        this.socket.emit('error', { message: 'User not authenticated' });
        return;
      }

      if (!targetUserId) {
        this.socket.emit('error', { message: 'Target user ID required' });
        return;
      }

      // Remove friendship (both directions)
      // Remove friendship from user to target
      await prisma.friend.deleteMany({
        where: {
          userId: userId,
          friendId: targetUserId
        }
      });
      
      // Remove friendship from target to user
      await prisma.friend.deleteMany({
        where: {
          userId: targetUserId,
          friendId: userId
        }
      });

      // Emit success event
      this.socket.emit('friendRemoved', { targetUserId });
      console.log(`[FRIENDS] User ${userId} removed friend ${targetUserId}`);

    } catch (error) {
      console.error('[FRIENDS] Error removing friend:', error);
      this.socket.emit('error', { message: 'Failed to remove friend' });
    }
  }

  async handleBlockUser(data) {
    try {
      const { targetUserId } = data;
      const userId = this.socket.userId;

      if (!userId) {
        this.socket.emit('error', { message: 'User not authenticated' });
        return;
      }

      if (!targetUserId) {
        this.socket.emit('error', { message: 'Target user ID required' });
        return;
      }

      if (userId === targetUserId) {
        this.socket.emit('error', { message: 'Cannot block yourself' });
        return;
      }

      // Remove any existing friendship first
      // Remove friendship from user to target
      await prisma.friend.deleteMany({
        where: {
          userId: userId,
          friendId: targetUserId
        }
      });
      
      // Remove friendship from target to user
      await prisma.friend.deleteMany({
        where: {
          userId: targetUserId,
          friendId: userId
        }
      });

      // Create or update block
      await prisma.blockedUser.upsert({
        where: {
          userId_blockedId: {
            userId: userId,
            blockedId: targetUserId
          }
        },
        update: {
          createdAt: new Date()
        },
        create: {
          userId: userId,
          blockedId: targetUserId,
          updatedAt: new Date()
        }
      });

      // Emit success event
      this.socket.emit('userBlocked', { targetUserId });
      console.log(`[BLOCK] User ${userId} blocked user ${targetUserId}`);

    } catch (error) {
      console.error('[BLOCK] Error blocking user:', error);
      this.socket.emit('error', { message: 'Failed to block user' });
    }
  }

  async handleUnblockUser(data) {
    try {
      const { targetUserId } = data;
      const userId = this.socket.userId;

      if (!userId) {
        this.socket.emit('error', { message: 'User not authenticated' });
        return;
      }

      if (!targetUserId) {
        this.socket.emit('error', { message: 'Target user ID required' });
        return;
      }

      // Remove block
      await prisma.blockedUser.deleteMany({
        where: {
          userId: userId,
          blockedId: targetUserId
        }
      });

      // Emit success event
      this.socket.emit('userUnblocked', { targetUserId });
      console.log(`[BLOCK] User ${userId} unblocked user ${targetUserId}`);

    } catch (error) {
      console.error('[BLOCK] Error unblocking user:', error);
      this.socket.emit('error', { message: 'Failed to unblock user' });
    }
  }
}

export { FriendBlockHandler };
