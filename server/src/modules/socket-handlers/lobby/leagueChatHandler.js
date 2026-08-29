import { LeagueService } from '../../../services/LeagueService.js';

export class LeagueChatHandler {
  constructor(io, socket) {
    this.io = io;
    this.socket = socket;
  }

  async handleJoinLeagueRoom(data) {
    try {
      const leagueId = data?.leagueId;
      const userId = this.socket.userId;
      if (!leagueId || !userId) return;

      const member = await LeagueService.assertMember(leagueId, userId);
      this.socket.join(`league_${leagueId}`);
      if (member.role === 'OWNER' || member.role === 'ADMIN') {
        this.socket.join(`league_admins_${leagueId}`);
      }
      this.socket.emit('league_room_joined', { leagueId });
    } catch (error) {
      this.socket.emit('error', { message: error.message || 'Failed to join league room' });
    }
  }

  async handleLeaveLeagueRoom(data) {
    const leagueId = data?.leagueId;
    if (!leagueId) return;
    this.socket.leave(`league_${leagueId}`);
    this.socket.leave(`league_admins_${leagueId}`);
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
}

export default LeagueChatHandler;
