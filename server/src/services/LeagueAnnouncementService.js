import { prisma } from '../config/databaseFirst.js';
import { LeagueService } from './LeagueService.js';

/** Fixed Discord-style reaction set for league announcements. */
export const LEAGUE_ANNOUNCEMENT_EMOJIS = ['👍', '❤️', '😂', '🔥', '😮', '🎉'];

const MAX_BODY = 4000;
const MAX_TITLE = 120;

function assertAllowedEmoji(emoji) {
  if (!LEAGUE_ANNOUNCEMENT_EMOJIS.includes(emoji)) {
    const err = new Error('Invalid reaction emoji');
    err.status = 400;
    throw err;
  }
}

function formatAnnouncement(row, viewerId) {
  const counts = new Map();
  const mine = new Set();
  for (const r of row.reactions || []) {
    counts.set(r.emoji, (counts.get(r.emoji) || 0) + 1);
    if (r.userId === viewerId) mine.add(r.emoji);
  }
  return {
    id: row.id,
    leagueId: row.leagueId,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: row.author,
    reactions: LEAGUE_ANNOUNCEMENT_EMOJIS.map((emoji) => ({
      emoji,
      count: counts.get(emoji) || 0,
      reacted: mine.has(emoji)
    })).filter((r) => r.count > 0 || r.reacted)
  };
}

export class LeagueAnnouncementService {
  static async getUnreadCount(leagueId, userId) {
    await LeagueService.assertMember(leagueId, userId);
    const cursor = await prisma.leagueAnnouncementRead.findUnique({
      where: { leagueId_userId: { leagueId, userId } }
    });
    const where = { leagueId };
    if (cursor?.lastReadAt) {
      where.createdAt = { gt: cursor.lastReadAt };
    }
    return prisma.leagueAnnouncement.count({ where });
  }

  static async list(leagueId, userId, { limit = 50 } = {}) {
    await LeagueService.assertMember(leagueId, userId);
    const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const rows = await prisma.leagueAnnouncement.findMany({
      where: { leagueId },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        reactions: { select: { emoji: true, userId: true } }
      }
    });
    const unreadCount = await this.getUnreadCount(leagueId, userId);
    return {
      announcements: rows.map((r) => formatAnnouncement(r, userId)),
      unreadCount,
      allowedEmojis: LEAGUE_ANNOUNCEMENT_EMOJIS
    };
  }

  static async create(leagueId, authorId, { title, body }) {
    await LeagueService.assertAdmin(leagueId, authorId);
    const trimmedBody = String(body || '').trim();
    if (!trimmedBody) {
      const err = new Error('Announcement body is required');
      err.status = 400;
      throw err;
    }
    if (trimmedBody.length > MAX_BODY) {
      const err = new Error(`Body too long (max ${MAX_BODY})`);
      err.status = 400;
      throw err;
    }
    let trimmedTitle = title != null ? String(title).trim() : '';
    if (trimmedTitle.length > MAX_TITLE) {
      const err = new Error(`Title too long (max ${MAX_TITLE})`);
      err.status = 400;
      throw err;
    }
    if (!trimmedTitle) trimmedTitle = null;

    const row = await prisma.leagueAnnouncement.create({
      data: {
        leagueId,
        authorId,
        title: trimmedTitle,
        body: trimmedBody
      },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        reactions: { select: { emoji: true, userId: true } }
      }
    });
    return formatAnnouncement(row, authorId);
  }

  static async remove(leagueId, actorId, announcementId) {
    await LeagueService.assertAdmin(leagueId, actorId);
    const existing = await prisma.leagueAnnouncement.findFirst({
      where: { id: announcementId, leagueId }
    });
    if (!existing) {
      const err = new Error('Announcement not found');
      err.status = 404;
      throw err;
    }
    await prisma.leagueAnnouncement.delete({ where: { id: announcementId } });
    return { id: announcementId, leagueId };
  }

  static async toggleReaction(leagueId, userId, announcementId, emoji) {
    await LeagueService.assertMember(leagueId, userId);
    assertAllowedEmoji(emoji);
    const announcement = await prisma.leagueAnnouncement.findFirst({
      where: { id: announcementId, leagueId }
    });
    if (!announcement) {
      const err = new Error('Announcement not found');
      err.status = 404;
      throw err;
    }

    const existing = await prisma.leagueAnnouncementReaction.findUnique({
      where: {
        announcementId_userId_emoji: { announcementId, userId, emoji }
      }
    });

    if (existing) {
      await prisma.leagueAnnouncementReaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.leagueAnnouncementReaction.create({
        data: { announcementId, userId, emoji }
      });
    }

    const row = await prisma.leagueAnnouncement.findUnique({
      where: { id: announcementId },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        reactions: { select: { emoji: true, userId: true } }
      }
    });
    return formatAnnouncement(row, userId);
  }

  static async markRead(leagueId, userId) {
    await LeagueService.assertMember(leagueId, userId);
    const now = new Date();
    await prisma.leagueAnnouncementRead.upsert({
      where: { leagueId_userId: { leagueId, userId } },
      create: { leagueId, userId, lastReadAt: now },
      update: { lastReadAt: now }
    });
    return { unreadCount: 0, lastReadAt: now };
  }
}
