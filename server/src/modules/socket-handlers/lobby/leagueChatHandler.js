import { prisma } from '../../../config/databaseFirst.js';
import { LeagueService } from '../../../services/LeagueService.js';
import { pushNotificationService } from '../../../services/PushNotificationService.js';
import { LobbyChatHandler } from './lobbyChatHandler.js';

function firstName(username) {
  const part = String(username || 'Player').trim().split(/\s+/)[0];
  return part || 'Player';
}

export class LeagueChatHandler {
  /**
   * leagueId -> userId -> presence entry (may have multiple sockets for same user)
   * @type {Map<string, Map<string, { userId: string, username: string, avatarUrl: string|null, sockets: Set<string> }>>}
   */
  static roomPresence = new Map();

  constructor(io, socket) {
    this.io = io;
    this.socket = socket;
  }

  static getPresenceList(leagueId) {
    const room = LeagueChatHandler.roomPresence.get(leagueId);
    if (!room) return [];
    return Array.from(room.values()).map(({ userId, username, avatarUrl }) => ({
      userId,
      username,
      avatarUrl
    }));
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

      await this.socket.join(`league_${leagueId}`);
      this.socket.leagueRooms.add(leagueId);

      if (member.role === 'OWNER' || member.role === 'ADMIN') {
        await this.socket.join(`league_admins_${leagueId}`);
      }

      if (!LeagueChatHandler.roomPresence.has(leagueId)) {
        LeagueChatHandler.roomPresence.set(leagueId, new Map());
      }
      const room = LeagueChatHandler.roomPresence.get(leagueId);
      const existing = room.get(userId);
      const isFirstSocket = !existing || existing.sockets.size === 0;

      if (existing) {
        existing.sockets.add(this.socket.id);
        existing.username = user.username;
        existing.avatarUrl = user.avatarUrl;
      } else {
        room.set(userId, {
          userId: user.id,
          username: user.username,
          avatarUrl: user.avatarUrl,
          sockets: new Set([this.socket.id])
        });
      }

      this.socket.emit('league_room_joined', { leagueId });
      LeagueChatHandler.emitPresence(this.io, leagueId);

      if (isFirstSocket) {
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

    const entry = room.get(userId);
    entry.sockets.delete(this.socket.id);

    // Another tab/socket still in the room — stay present, no leave message
    if (entry.sockets.size > 0) {
      LeagueChatHandler.emitPresence(this.io, leagueId);
      return;
    }

    room.delete(userId);
    if (room.size === 0) LeagueChatHandler.roomPresence.delete(leagueId);

    LeagueChatHandler.emitPresence(this.io, leagueId);
    if (announce && entry) {
      LeagueChatHandler.emitSystemMessage(
        this.io,
        leagueId,
        `${firstName(entry.username)} left the room`
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

      // Push to offline league members (app closed/backgrounded => socket disconnected)
      try {
        const tokenUserIds = await pushNotificationService.getUsersWithTokens();
        const tokenSet = new Set(tokenUserIds);

        const members = await LeagueService.listMembers(leagueId, userId);
        const memberUserIds = members.map((m) => m.userId);

        const offlineRecipients = memberUserIds.filter(
          (uid) => uid !== userId && tokenSet.has(uid) && !LobbyChatHandler.connectedUsers.has(uid)
        );

        await pushNotificationService.sendToUsers({
          userIds: offlineRecipients,
          title: `New league chat`,
          body: chatMessage?.message?.slice(0, 90),
          data: {
            type: 'league_chat_message',
            route: `/league/${leagueId}`,
            leagueId: leagueId,
            messageId: chatMessage.id
          },
          dedupeKeyPrefix: `push:dedupe:league_chat:${leagueId}:${chatMessage.id}`
        });
      } catch (e) {
        console.warn('[PUSH] League chat push failed:', e?.message || e);
      }
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

      const admin = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true }
      });

      this.io.to(`league_${leagueId}`).emit('league_chat_deleted', {
        leagueId,
        messageId,
        deletedBy: firstName(admin?.username)
      });
      LeagueChatHandler.emitSystemMessage(
        this.io,
        leagueId,
        `${firstName(admin?.username)} deleted a message`
      );
    } catch (error) {
      this.socket.emit('error', { message: error.message || 'Failed to delete message' });
    }
  }
}

export default LeagueChatHandler;
