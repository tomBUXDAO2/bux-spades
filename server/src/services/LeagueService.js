import { prisma } from '../config/databaseFirst.js';
import { sanitizeChatMessage } from '../utils/chatGif.js';

function slugify(name) {
  const base = String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || `league-${Date.now().toString(36)}`;
}

function facebookProfileUrl(facebookId) {
  return facebookId ? `https://www.facebook.com/${facebookId}` : null;
}

export class LeagueService {
  static async requireFacebookUser(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, avatarUrl: true, facebookId: true, discordId: true }
    });
    if (!user) {
      const err = new Error('User not found');
      err.status = 404;
      throw err;
    }
    if (!user.facebookId) {
      const err = new Error('Facebook login required for leagues');
      err.status = 403;
      throw err;
    }
    return user;
  }

  static async getMembership(leagueId, userId) {
    return prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId } }
    });
  }

  static async assertMember(leagueId, userId) {
    const member = await this.getMembership(leagueId, userId);
    if (!member) {
      const err = new Error('League membership required');
      err.status = 403;
      throw err;
    }
    return member;
  }

  static async assertAdmin(leagueId, userId) {
    const member = await this.assertMember(leagueId, userId);
    if (member.role !== 'OWNER' && member.role !== 'ADMIN') {
      const err = new Error('League admin access required');
      err.status = 403;
      throw err;
    }
    return member;
  }

  static async assertOwner(leagueId, userId) {
    const member = await this.assertMember(leagueId, userId);
    if (member.role !== 'OWNER') {
      const err = new Error('League owner access required');
      err.status = 403;
      throw err;
    }
    return member;
  }

  static isTimedOut(member) {
    return Boolean(member?.timeoutUntil && new Date(member.timeoutUntil) > new Date());
  }

  static isMuted(member) {
    return Boolean(member?.mutedUntil && new Date(member.mutedUntil) > new Date());
  }

  static async createLeague({ name, ownerUserId, bgColor, logoUrl, requireJoinApproval = true }) {
    const owner = await this.requireFacebookUser(ownerUserId);
    let slug = slugify(name);
    const existing = await prisma.league.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    }

    const league = await prisma.league.create({
      data: {
        name: name.trim(),
        slug,
        ownerId: owner.id,
        bgColor: bgColor || '#0f172a',
        logoUrl: logoUrl || null,
        requireJoinApproval: requireJoinApproval !== false,
        members: {
          create: {
            userId: owner.id,
            role: 'OWNER'
          }
        }
      },
      include: {
        owner: { select: { id: true, username: true, avatarUrl: true, facebookId: true } },
        _count: { select: { members: true } }
      }
    });

    return league;
  }

  static async submitCreateRequest({ requesterId, name, logoUrl, bgColor, requireJoinApproval = true }) {
    await this.requireFacebookUser(requesterId);
    const trimmed = String(name || '').trim();
    if (!trimmed) {
      const err = new Error('League name is required');
      err.status = 400;
      throw err;
    }

    const pending = await prisma.leagueCreateRequest.findFirst({
      where: { requesterId, status: 'PENDING' }
    });
    if (pending) {
      const err = new Error('You already have a pending league create request');
      err.status = 400;
      throw err;
    }

    const color = typeof bgColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(bgColor.trim())
      ? bgColor.trim()
      : '#0f172a';

    return prisma.leagueCreateRequest.create({
      data: {
        name: trimmed,
        logoUrl: logoUrl || null,
        bgColor: color,
        requireJoinApproval: requireJoinApproval !== false,
        requesterId,
        status: 'PENDING'
      },
      include: {
        requester: { select: { id: true, username: true, avatarUrl: true, facebookId: true } }
      }
    });
  }

  static async listCreateRequests() {
    const requests = await prisma.leagueCreateRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: {
        requester: { select: { id: true, username: true, avatarUrl: true, facebookId: true } }
      }
    });
    return requests.map((r) => ({
      ...r,
      facebookProfileUrl: facebookProfileUrl(r.requester.facebookId)
    }));
  }

  static async approveCreateRequest(requestId, adminUserId) {
    const request = await prisma.leagueCreateRequest.findFirst({
      where: { id: requestId, status: 'PENDING' }
    });
    if (!request) {
      const err = new Error('Create request not found');
      err.status = 404;
      throw err;
    }

    const league = await this.createLeague({
      name: request.name,
      ownerUserId: request.requesterId,
      logoUrl: request.logoUrl,
      bgColor: request.bgColor,
      requireJoinApproval: request.requireJoinApproval
    });

    await prisma.leagueCreateRequest.update({
      where: { id: request.id },
      data: { status: 'APPROVED', approvedLeagueId: league.id }
    });

    return { league, requestId: request.id, approvedBy: adminUserId };
  }

  static async rejectCreateRequest(requestId) {
    const request = await prisma.leagueCreateRequest.findFirst({
      where: { id: requestId, status: 'PENDING' }
    });
    if (!request) {
      const err = new Error('Create request not found');
      err.status = 404;
      throw err;
    }
    await prisma.leagueCreateRequest.update({
      where: { id: request.id },
      data: { status: 'REJECTED' }
    });
    return { success: true };
  }

  static async getMyPendingCreateRequest(userId) {
    return prisma.leagueCreateRequest.findFirst({
      where: { requesterId: userId, status: 'PENDING' }
    });
  }

  static async listLeaguesForUser(userId) {
    const user = userId
      ? await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, facebookId: true }
        })
      : null;

    if (!user?.facebookId) {
      return { requiresFacebook: true, leagues: [], pendingCreateRequest: null };
    }

    try {
      const [leagues, pendingCreateRequest] = await Promise.all([
        prisma.league.findMany({
          orderBy: { name: 'asc' },
          include: {
            owner: { select: { id: true, username: true, avatarUrl: true } },
            members: {
              where: { userId: user.id },
              select: { role: true, mutedUntil: true, timeoutUntil: true }
            },
            joinRequests: {
              where: { userId: user.id, status: 'PENDING' },
              select: { id: true, status: true }
            },
            _count: { select: { members: true } }
          }
        }),
        this.getMyPendingCreateRequest(user.id).catch(() => null)
      ]);

      return {
        requiresFacebook: false,
        pendingCreateRequest,
        leagues: leagues.map((league) => {
          const membership = league.members[0] || null;
          const pendingRequest = league.joinRequests[0] || null;
          return {
            id: league.id,
            name: league.name,
            slug: league.slug,
            bgColor: league.bgColor,
            logoUrl: league.logoUrl,
            requireJoinApproval: league.requireJoinApproval,
            owner: league.owner,
            memberCount: league._count.members,
            isMember: Boolean(membership),
            role: membership?.role || null,
            mutedUntil: membership?.mutedUntil || null,
            timeoutUntil: membership?.timeoutUntil || null,
            pendingRequest: Boolean(pendingRequest),
            pendingRequestId: pendingRequest?.id || null
          };
        })
      };
    } catch (error) {
      // Missing migration on the connected DB
      if (error?.code === 'P2021' || /does not exist/i.test(error?.message || '')) {
        const err = new Error(
          'League tables are not set up on this database yet. Run prisma db push against the production DATABASE_URL.'
        );
        err.status = 503;
        throw err;
      }
      throw error;
    }
  }

  static async getLeague(leagueId, viewerId = null) {
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: {
        owner: { select: { id: true, username: true, avatarUrl: true, facebookId: true } },
        _count: { select: { members: true } }
      }
    });
    if (!league) {
      const err = new Error('League not found');
      err.status = 404;
      throw err;
    }

    let membership = null;
    let pendingRequest = null;
    if (viewerId) {
      membership = await this.getMembership(leagueId, viewerId);
      pendingRequest = await prisma.leagueJoinRequest.findFirst({
        where: { leagueId, userId: viewerId, status: 'PENDING' }
      });
    }

    return {
      id: league.id,
      name: league.name,
      slug: league.slug,
      bgColor: league.bgColor,
      logoUrl: league.logoUrl,
      requireJoinApproval: league.requireJoinApproval,
      owner: league.owner,
      memberCount: league._count.members,
      isMember: Boolean(membership),
      role: membership?.role || null,
      mutedUntil: membership?.mutedUntil || null,
      timeoutUntil: membership?.timeoutUntil || null,
      pendingRequest: Boolean(pendingRequest),
      createdAt: league.createdAt
    };
  }

  static async updateTheme(leagueId, actorId, { name, bgColor, logoUrl }) {
    await this.assertOwner(leagueId, actorId);
    const data = {};
    if (typeof name === 'string' && name.trim()) data.name = name.trim();
    if (typeof bgColor === 'string' && bgColor.trim()) data.bgColor = bgColor.trim();
    if (logoUrl !== undefined) data.logoUrl = logoUrl;

    return prisma.league.update({
      where: { id: leagueId },
      data,
      include: {
        owner: { select: { id: true, username: true, avatarUrl: true, facebookId: true } }
      }
    });
  }

  static async requestJoin(leagueId, userId) {
    await this.requireFacebookUser(userId);
    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) {
      const err = new Error('League not found');
      err.status = 404;
      throw err;
    }

    const existingMember = await this.getMembership(leagueId, userId);
    if (existingMember) {
      const err = new Error('Already a member');
      err.status = 400;
      throw err;
    }

    // Open leagues: join instantly without admin approval
    if (league.requireJoinApproval === false) {
      await prisma.leagueMember.create({
        data: { leagueId, userId, role: 'MEMBER' }
      });
      await prisma.leagueJoinRequest.upsert({
        where: { leagueId_userId: { leagueId, userId } },
        create: { leagueId, userId, status: 'APPROVED' },
        update: { status: 'APPROVED', updatedAt: new Date() }
      });
      return {
        instantJoin: true,
        leagueId,
        userId,
        status: 'APPROVED'
      };
    }

    const request = await prisma.leagueJoinRequest.upsert({
      where: { leagueId_userId: { leagueId, userId } },
      create: { leagueId, userId, status: 'PENDING' },
      update: { status: 'PENDING', updatedAt: new Date() },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true, facebookId: true } },
        league: { select: { id: true, name: true } }
      }
    });

    return {
      ...request,
      instantJoin: false,
      facebookProfileUrl: facebookProfileUrl(request.user.facebookId)
    };
  }

  static async listJoinRequests(leagueId, actorId) {
    await this.assertAdmin(leagueId, actorId);
    const requests = await prisma.leagueJoinRequest.findMany({
      where: { leagueId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true, facebookId: true } }
      }
    });
    return requests.map((r) => ({
      ...r,
      facebookProfileUrl: facebookProfileUrl(r.user.facebookId)
    }));
  }

  static async approveJoinRequest(leagueId, requestId, actorId) {
    await this.assertAdmin(leagueId, actorId);
    const request = await prisma.leagueJoinRequest.findFirst({
      where: { id: requestId, leagueId, status: 'PENDING' }
    });
    if (!request) {
      const err = new Error('Join request not found');
      err.status = 404;
      throw err;
    }

    await prisma.$transaction([
      prisma.leagueJoinRequest.update({
        where: { id: request.id },
        data: { status: 'APPROVED' }
      }),
      prisma.leagueMember.upsert({
        where: { leagueId_userId: { leagueId, userId: request.userId } },
        create: { leagueId, userId: request.userId, role: 'MEMBER' },
        update: {}
      })
    ]);

    return { success: true, userId: request.userId };
  }

  static async rejectJoinRequest(leagueId, requestId, actorId) {
    await this.assertAdmin(leagueId, actorId);
    const request = await prisma.leagueJoinRequest.findFirst({
      where: { id: requestId, leagueId, status: 'PENDING' }
    });
    if (!request) {
      const err = new Error('Join request not found');
      err.status = 404;
      throw err;
    }
    await prisma.leagueJoinRequest.update({
      where: { id: request.id },
      data: { status: 'REJECTED' }
    });
    return { success: true };
  }

  static async listMembers(leagueId, actorId) {
    await this.assertMember(leagueId, actorId);
    return prisma.leagueMember.findMany({
      where: { leagueId },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      include: {
        user: { select: { id: true, username: true, avatarUrl: true, facebookId: true } }
      }
    });
  }

  static async setMemberRole(leagueId, actorId, targetUserId, role) {
    await this.assertOwner(leagueId, actorId);
    if (!['ADMIN', 'MEMBER'].includes(role)) {
      const err = new Error('Role must be ADMIN or MEMBER');
      err.status = 400;
      throw err;
    }
    const target = await this.getMembership(leagueId, targetUserId);
    if (!target || target.role === 'OWNER') {
      const err = new Error('Cannot change this member');
      err.status = 400;
      throw err;
    }
    return prisma.leagueMember.update({
      where: { leagueId_userId: { leagueId, userId: targetUserId } },
      data: { role }
    });
  }

  static async muteMember(leagueId, actorId, targetUserId, until) {
    await this.assertAdmin(leagueId, actorId);
    const target = await this.assertMember(leagueId, targetUserId);
    if (target.role === 'OWNER') {
      const err = new Error('Cannot mute the owner');
      err.status = 400;
      throw err;
    }
    return prisma.leagueMember.update({
      where: { leagueId_userId: { leagueId, userId: targetUserId } },
      data: { mutedUntil: until }
    });
  }

  static async timeoutMember(leagueId, actorId, targetUserId, until) {
    await this.assertAdmin(leagueId, actorId);
    const target = await this.assertMember(leagueId, targetUserId);
    if (target.role === 'OWNER') {
      const err = new Error('Cannot timeout the owner');
      err.status = 400;
      throw err;
    }
    return prisma.leagueMember.update({
      where: { leagueId_userId: { leagueId, userId: targetUserId } },
      data: { timeoutUntil: until }
    });
  }

  static async clearTimeout(leagueId, actorId, targetUserId) {
    await this.assertAdmin(leagueId, actorId);
    return prisma.leagueMember.update({
      where: { leagueId_userId: { leagueId, userId: targetUserId } },
      data: { timeoutUntil: null }
    });
  }

  static async clearMute(leagueId, actorId, targetUserId) {
    await this.assertAdmin(leagueId, actorId);
    return prisma.leagueMember.update({
      where: { leagueId_userId: { leagueId, userId: targetUserId } },
      data: { mutedUntil: null }
    });
  }

  static async kickMember(leagueId, actorId, targetUserId) {
    await this.assertAdmin(leagueId, actorId);
    const target = await this.getMembership(leagueId, targetUserId);
    if (!target || target.role === 'OWNER') {
      const err = new Error('Cannot kick this member');
      err.status = 400;
      throw err;
    }
    await prisma.$transaction([
      prisma.leagueMember.delete({
        where: { leagueId_userId: { leagueId, userId: targetUserId } }
      }),
      prisma.leagueJoinRequest.deleteMany({
        where: { leagueId, userId: targetUserId }
      })
    ]);
    return { success: true };
  }

  static async assertCanPlay(leagueId, userId) {
    await this.requireFacebookUser(userId);
    const member = await this.assertMember(leagueId, userId);
    if (this.isTimedOut(member)) {
      const err = new Error('You are timed out from this league');
      err.status = 403;
      throw err;
    }
    return member;
  }

  static async getRecentChat(leagueId, userId, limit = 100) {
    await this.assertMember(leagueId, userId);
    const messages = await prisma.leagueChatMessage.findMany({
      where: { leagueId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } }
      }
    });
    return messages.reverse().map((m) => ({
      id: m.id,
      userId: m.userId,
      userName: m.user.username,
      userAvatar: m.user.avatarUrl,
      message: m.message,
      timestamp: m.createdAt.getTime(),
      leagueId
    }));
  }

  static async postChatMessage(leagueId, userId, message) {
    const member = await this.assertMember(leagueId, userId);
    if (this.isMuted(member)) {
      const err = new Error('You are muted in this league');
      err.status = 403;
      throw err;
    }
    const text = sanitizeChatMessage(message).slice(0, 1000);
    const created = await prisma.leagueChatMessage.create({
      data: { leagueId, userId, message: text },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } }
      }
    });
    return {
      id: created.id,
      userId: created.userId,
      userName: created.user.username,
      userAvatar: created.user.avatarUrl,
      message: created.message,
      timestamp: created.createdAt.getTime(),
      leagueId
    };
  }

  static async deleteChatMessage(leagueId, actorId, messageId) {
    await this.assertAdmin(leagueId, actorId);
    const existing = await prisma.leagueChatMessage.findFirst({
      where: { id: messageId, leagueId }
    });
    if (!existing) {
      const err = new Error('Message not found');
      err.status = 404;
      throw err;
    }
    await prisma.leagueChatMessage.delete({ where: { id: messageId } });
    return { leagueId, messageId };
  }

  static parseTimeoutDuration(body) {
    if (body?.until) {
      const until = new Date(body.until);
      if (Number.isNaN(until.getTime())) {
        const err = new Error('Invalid until date');
        err.status = 400;
        throw err;
      }
      return until;
    }
    const presets = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000
    };
    if (body?.preset && presets[body.preset]) {
      return new Date(Date.now() + presets[body.preset]);
    }
    if (typeof body?.minutes === 'number' && body.minutes > 0) {
      return new Date(Date.now() + body.minutes * 60 * 1000);
    }
    const err = new Error('Provide preset (1h|24h|7d), minutes, or until');
    err.status = 400;
    throw err;
  }
}

export default LeagueService;
