import { prisma } from '../../../config/databaseFirst.js';
import { LeagueService } from '../../../services/LeagueService.js';

function firstName(username) {
  const part = String(username || 'Player').trim().split(/\s+/)[0];
  return part || 'Player';
}

export class LeagueChatHandler {
  /** @type {Map<string, Map<string, { userId: string, username: string, avatarUrl: string|null }>>} */
  static roomPresence = new Map();

  constructor(io, socket) {
    this.io = io;
    this.socket = socket;
  }

  static getPresenceList(leagueId) {
    const room = LeagueChatHandler.roomPresence.get(leagueId);
    if (!room) return [];
    return Array.from(room.values());
  }

  static emitPresence(io, leagueId) {
    io.to(`league_${leagueId}`).emit('league_online_users', {
      leagueId,
      users: LeagueChatHandler.getPresenceList(leagueId)
    });
  }

  static emitSystemMessage(io, leagueId, text) {
    io.to(`league_${leagueId}`).emit('league_chat_message', {
      id: `system-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      leagueId,
      userId: 'system',
      userName: 'System',
      message: text,
      timestamp: Date.now()
    });
  }

  async handleJoinLeagueRoom(data) {
    try {
      const leagueId = data?.leagueId;
      const userId = this.socket.userId;
      if (!leagueId || !userId) return;

      const member = await LeagueService.assertMember(leagueId, userId);
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, avatarUrl: true }
      });
      if (!user) return;

      if (!this.socket.leagueRooms) this.socket.leagueRooms = new Set();

      const alreadyHere = LeagueChatHandler.roomPresence.get(leagueId)?.has(userId);
      this.socket.join(`league_${leagueId}`);
      this.socket.leagueRooms.add(leagueId);

      if (member.role === 'OWNER' || member.role === 'ADMIN') {
        this.socket.join(`league_admins_${leagueId}`);
      }

      if (!LeagueChatHandler.roomPresence.has(leagueId)) {
        LeagueChatHandler.roomPresence.set(leagueId, new Map());
      }
      LeagueChatHandler.roomPresence.get(leagueId).set(userId, {
        userId: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl
      });

      this.socket.emit('league_room_joined', { leagueId });
      LeagueChatHandler.emitPresence(this.io, leagueId);

      if (!alreadyHere) {
        LeagueChatHandler.emitSystemMessage(
          this.io,
          leagueId,
          `${firstName(user.username)} joined the room`
        );
      }
    } catch (error) {
      this.socket.emit('error', { message: error.message || 'Failed to join league room' });
    }
  }

  async handleLeaveLeagueRoom(data) {
    const leagueId = data?.leagueId;
    if (!leagueId) return;
    await this.leaveLeagueRoom(leagueId, true);
  }

  async leaveLeagueRoom(leagueId, announce) {
    const userId = this.socket.userId;
    this.socket.leave(`league_${leagueId}`);
    this.socket.leave(`league_admins_${leagueId}`);
    if (this.socket.leagueRooms) this.socket.leagueRooms.delete(leagueId);

    const room = LeagueChatHandler.roomPresence.get(leagueId);
    if (!room || !userId || !room.has(userId)) {
      LeagueChatHandler.emitPresence(this.io, leagueId);
      return;
    }

    const user = room.get(userId);
    room.delete(userId);
    if (room.size === 0) LeagueChatHandler.roomPresence.delete(leagueId);

    LeagueChatHandler.emitPresence(this.io, leagueId);
    if (announce && user) {
      LeagueChatHandler.emitSystemMessage(
        this.io,
        leagueId,
        `${firstName(user.username)} left the room`
      );
    }
  }

  async handleDisconnect() {
    const rooms = this.socket.leagueRooms ? Array.from(this.socket.leagueRooms) : [];
    for (const leagueId of rooms) {
      await this.leaveLeagueRoom(leagueId, true);
    }
  }

  async handleLeagueMessage(data) {
    try {
      const leagueId = data?.leagueId;
      const message = data?.message;
      const userId = this.socket.userId;
      if (!leagueId || !userId) {
        this.socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const chatMessage = await LeagueService.postChatMessage(leagueId, userId, message);
      this.io.to(`league_${leagueId}`).emit('league_chat_message', chatMessage);
    } catch (error) {
      this.socket.emit('error', { message: error.message || 'Failed to send league message' });
    }
  }

  async handleDeleteLeagueMessage(data) {
    try {
      const leagueId = data?.leagueId;
      const messageId = data?.messageId;
      const userId = this.socket.userId;
      if (!leagueId || !messageId || !userId) {
        this.socket.emit('error', { message: 'Invalid delete request' });
        return;
      }
      await LeagueService.deleteChatMessage(leagueId, userId, messageId);
      this.io.to(`league_${leagueId}`).emit('league_chat_deleted', { leagueId, messageId });
    } catch (error) {
      this.socket.emit('error', { message: error.message || 'Failed to delete message' });
    }
  }
}

export default LeagueChatHandler;
