import { prisma } from '../config/database.js';

const ACTIVE_STATUSES = ['SCHEDULED', 'ACTIVE'];

export class EventService {
  static sanitizeCriteria(criteria = []) {
    if (!Array.isArray(criteria) || criteria.length === 0) {
      return [];
    }

    const seen = new Set();
    return criteria.map((criterion) => {
      if (!criterion || typeof criterion !== 'object') {
        throw new Error('Invalid event criterion payload');
      }

      const { type, rewardCoins, milestoneValue = null, config = null } = criterion;

      if (!type || typeof type !== 'string') {
        throw new Error('Event criterion type is required');
      }

      if (seen.has(type)) {
        throw new Error(`Duplicate event criterion type: ${type}`);
      }
      seen.add(type);

      const parsedReward = Number(rewardCoins);
      if (!Number.isFinite(parsedReward) || parsedReward <= 0) {
        throw new Error(`Reward must be a positive number for criterion ${type}`);
      }

      let parsedMilestone = null;
      if (milestoneValue !== null && milestoneValue !== undefined) {
        parsedMilestone = Number(milestoneValue);
        if (!Number.isFinite(parsedMilestone) || parsedMilestone <= 0) {
          throw new Error(`Milestone value must be a positive number for criterion ${type}`);
        }
      }

      return {
        type,
        rewardCoins: Math.floor(parsedReward),
        milestoneValue: parsedMilestone,
        config: config || null
      };
    });
  }

  static sanitizeFilters(filters) {
    if (filters === null || filters === undefined) {
      return null;
    }

    if (typeof filters !== 'object') {
      throw new Error('Event filters must be an object');
    }

    return filters;
  }

  static parseDate(value, label) {
    if (!value) {
      throw new Error(`${label} is required`);
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`${label} is invalid`);
    }
    return parsed;
  }

  static async ensureNoActiveEvent(tx) {
    const existing = await tx.event.findFirst({
      where: {
        status: { in: ACTIVE_STATUSES },
      },
    });

    if (existing) {
      throw new Error('An event is already scheduled or active. Complete or cancel it before creating a new one.');
    }
  }

  static determineInitialStatus(startsAt, endsAt) {
    const now = new Date();
    if (now >= endsAt) {
      return 'COMPLETED';
    }
    if (now >= startsAt && now <= endsAt) {
      return 'ACTIVE';
    }
    return 'SCHEDULED';
  }

  static async createEvent(data, createdById) {
    const {
      name,
      description = null,
      timezone,
      startsAt,
      endsAt,
      bannerUrl = null,
      filters = null,
      criteria = [],
    } = data || {};

    if (!name || typeof name !== 'string') {
      throw new Error('Event name is required');
    }

    if (!timezone || typeof timezone !== 'string') {
      throw new Error('Event timezone is required');
    }

    const startDate = this.parseDate(startsAt, 'Event start time');
    const endDate = this.parseDate(endsAt, 'Event end time');

    if (endDate <= startDate) {
      throw new Error('Event end time must be after the start time');
    }

    const sanitizedCriteria = this.sanitizeCriteria(criteria);
    const sanitizedFilters = this.sanitizeFilters(filters);
    const status = this.determineInitialStatus(startDate, endDate);

    return prisma.$transaction(async (tx) => {
      await this.ensureNoActiveEvent(tx);

      const event = await tx.event.create({
        data: {
          name: name.trim(),
          description,
          timezone,
          startsAt: startDate,
          endsAt: endDate,
          status,
          bannerUrl,
          filters: sanitizedFilters,
          createdById: createdById || null,
          criteria: sanitizedCriteria.length
            ? {
                create: sanitizedCriteria.map((criterion) => ({
                  type: criterion.type,
                  rewardCoins: criterion.rewardCoins,
                  milestoneValue: criterion.milestoneValue,
                  config: criterion.config,
                })),
              }
            : undefined,
        },
        include: {
          criteria: true,
        },
      });

      return event;
    });
  }

  static async updateEvent(eventId, data) {
    if (!eventId) {
      throw new Error('Event ID is required');
    }

    const {
      name,
      description,
      timezone,
      startsAt,
      endsAt,
      bannerUrl,
      filters,
      criteria,
      status,
    } = data || {};

    const updates = {};

    if (name !== undefined) {
      if (!name || typeof name !== 'string') {
        throw new Error('Event name must be a non-empty string');
      }
      updates.name = name.trim();
    }

    if (description !== undefined) {
      updates.description = description || null;
    }

    if (timezone !== undefined) {
      if (!timezone || typeof timezone !== 'string') {
        throw new Error('Timezone must be a valid string');
      }
      updates.timezone = timezone;
    }

    if (bannerUrl !== undefined) {
      updates.bannerUrl = bannerUrl || null;
    }

    if (startsAt !== undefined) {
      updates.startsAt = this.parseDate(startsAt, 'Event start time');
    }

    if (endsAt !== undefined) {
      updates.endsAt = this.parseDate(endsAt, 'Event end time');
    }

    if (updates.startsAt && updates.endsAt && updates.endsAt <= updates.startsAt) {
      throw new Error('Event end time must be after the start time');
    }

    if (filters !== undefined) {
      updates.filters = this.sanitizeFilters(filters);
    }

    if (status !== undefined) {
      const allowedStatuses = ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'];
      if (!allowedStatuses.includes(status)) {
        throw new Error(`Invalid event status: ${status}`);
      }
      updates.status = status;
    }

    const sanitizedCriteria = criteria !== undefined ? this.sanitizeCriteria(criteria) : null;

    return prisma.$transaction(async (tx) => {
      if (updates.startsAt || updates.endsAt) {
        const event = await tx.event.findUnique({
          where: { id: eventId },
          select: { id: true, startsAt: true, endsAt: true },
        });

        if (!event) {
          throw new Error('Event not found');
        }

        const nextStartsAt = updates.startsAt || event.startsAt;
        const nextEndsAt = updates.endsAt || event.endsAt;

        if (nextEndsAt <= nextStartsAt) {
          throw new Error('Event end time must be after the start time');
        }
      }

      const updated = await tx.event.update({
        where: { id: eventId },
        data: updates,
      });

      if (sanitizedCriteria !== null) {
        await tx.eventCriterion.deleteMany({
          where: { eventId },
        });

        if (sanitizedCriteria.length > 0) {
          await tx.eventCriterion.createMany({
            data: sanitizedCriteria.map((criterion) => ({
              eventId,
              type: criterion.type,
              rewardCoins: criterion.rewardCoins,
              milestoneValue: criterion.milestoneValue,
              config: criterion.config,
            })),
          });
        }
      }

      return tx.event.findUnique({
        where: { id: eventId },
        include: {
          criteria: true,
        },
      });
    });
  }

  static async listEvents(options = {}) {
    const {
      status,
      limit = 50,
      includeCriteria = false,
      includeStats = false,
      orderBy = { startsAt: 'desc' },
    } = options;

    const where = {};
    if (status) {
      where.status = Array.isArray(status) ? { in: status } : status;
    }

    return prisma.event.findMany({
      where,
      orderBy,
      take: limit,
      include: {
        criteria: includeCriteria,
        participants: includeStats,
      },
    });
  }

  static async getEventById(eventId, options = {}) {
    if (!eventId) {
      throw new Error('Event ID is required');
    }

    const { includeCriteria = true, includeStats = false, includeGames = false } = options;

    return prisma.event.findUnique({
      where: { id: eventId },
      include: {
        criteria: includeCriteria,
        participants: includeStats,
        EventGame: includeGames,
      },
    });
  }

  static async getActiveEvent(options = {}) {
    const { includeCriteria = true, includeStats = false, includeGames = false } = options;
    const now = new Date();

    let event = await prisma.event.findFirst({
      where: {
        OR: [
          { status: 'ACTIVE' },
          {
            status: 'SCHEDULED',
            startsAt: { lte: now },
            endsAt: { gte: now },
          },
        ],
      },
      orderBy: {
        startsAt: 'asc',
      },
      include: {
        criteria: includeCriteria,
        participants: includeStats,
        EventGame: includeGames,
      },
    });

    if (!event) {
      return null;
    }

    if (now >= event.startsAt && now <= event.endsAt && event.status !== 'ACTIVE') {
      event = await prisma.event.update({
        where: { id: event.id },
        data: { status: 'ACTIVE' },
        include: {
          criteria: includeCriteria,
          participants: includeStats,
          EventGame: includeGames,
        },
      });
    }

    if (now > event.endsAt) {
      await prisma.event.update({
        where: { id: event.id },
        data: { status: 'COMPLETED' },
      });
      return null;
    }

    return event;
  }

  static async updateEventStatus(eventId, status) {
    if (!eventId) {
      throw new Error('Event ID is required');
    }

    const allowedStatuses = ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'];
    if (!allowedStatuses.includes(status)) {
      throw new Error(`Invalid event status: ${status}`);
    }

    return prisma.event.update({
      where: { id: eventId },
      data: { status },
      include: {
        criteria: true,
      },
    });
  }

  static async listEventParticipantsUsers(userIds = []) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return [];
    }

    return prisma.user.findMany({
      where: {
        id: { in: userIds },
      },
      select: {
        id: true,
        username: true,
        discordId: true,
      },
    });
  }

  static async tagGame(eventId, gameId, qualifies = true) {
    if (!eventId || !gameId) {
      throw new Error('Event ID and game ID are required to tag a game');
    }

    return prisma.$transaction(async (tx) => {
      const event = await tx.event.findUnique({
        where: { id: eventId },
        select: { id: true, status: true },
      });

      if (!event) {
        throw new Error('Event not found');
      }

      if (event.status !== 'ACTIVE' && event.status !== 'SCHEDULED') {
        throw new Error('Cannot tag games for an event that is not active or scheduled');
      }

      await tx.game.update({
        where: { id: gameId },
        data: {
          eventId,
          isLeague: true,
        },
      });

      await tx.eventGame.upsert({
        where: {
          eventId_gameId: {
            eventId,
            gameId,
          },
        },
        update: {
          qualifies,
        },
        create: {
          eventId,
          gameId,
          qualifies,
        },
      });
    });
  }

  static async untagGame(gameId) {
    if (!gameId) {
      throw new Error('Game ID is required to untag');
    }

    return prisma.$transaction(async (tx) => {
      const game = await tx.game.findUnique({
        where: { id: gameId },
        select: { eventId: true },
      });

      if (!game || !game.eventId) {
        return;
      }

      await tx.eventGame.deleteMany({
        where: {
          eventId: game.eventId,
          gameId,
        },
      });

      await tx.game.update({
        where: { id: gameId },
        data: {
          eventId: null,
        },
      });
    });
  }

  static async upsertParticipant(eventId, userId, updates = {}) {
    if (!eventId || !userId) {
      throw new Error('Event ID and user ID are required for participant updates');
    }

    const {
      gamesPlayedDelta = 0,
      gamesWonDelta = 0,
      milestoneProgress: milestoneDelta = null,
    } = updates;

    const participant = await prisma.eventParticipantStat.upsert({
      where: {
        eventId_userId: {
          eventId,
          userId,
        },
      },
      update: {
        gamesPlayed: {
          increment: gamesPlayedDelta,
        },
        gamesWon: {
          increment: gamesWonDelta,
        },
      },
      create: {
        eventId,
        userId,
        gamesPlayed: Math.max(0, gamesPlayedDelta),
        gamesWon: Math.max(0, gamesWonDelta),
        winPercent: 0,
      },
    });

    const totals = {
      gamesPlayed: participant.gamesPlayed,
      gamesWon: participant.gamesWon,
    };

    const winPercent =
      totals.gamesPlayed > 0 ? Number(((totals.gamesWon / totals.gamesPlayed) * 100).toFixed(2)) : 0;

    let mergedMilestones = participant.milestoneProgress || null;
    if (milestoneDelta && typeof milestoneDelta === 'object') {
      const base = (participant.milestoneProgress && typeof participant.milestoneProgress === 'object')
        ? { ...participant.milestoneProgress }
        : {};
      for (const [key, value] of Object.entries(milestoneDelta)) {
        const delta = Number(value) || 0;
        base[key] = (base[key] || 0) + delta;
      }
      mergedMilestones = base;
    }

    return prisma.eventParticipantStat.update({
      where: {
        eventId_userId: {
          eventId,
          userId,
        },
      },
      data: {
        winPercent,
        ...(mergedMilestones !== null ? { milestoneProgress: mergedMilestones } : {}),
      },
    });
  }

  static async resetEventParticipants(eventId) {
    if (!eventId) {
      throw new Error('Event ID is required');
    }

    await prisma.eventParticipantStat.deleteMany({
      where: { eventId },
    });
  }

  static async recordGameCompletion({ eventId, gameId, winner, players }) {
    if (!eventId || !Array.isArray(players) || players.length === 0) {
      return;
    }

    const winningUserIds = new Set();
    if (winner && typeof winner === 'string') {
      if (winner.startsWith('TEAM_')) {
        const teamIndex = parseInt(winner.split('_')[1], 10);
        if (!Number.isNaN(teamIndex)) {
          players.forEach((player) => {
            if (player.seatIndex !== null && player.seatIndex % 2 === teamIndex) {
              winningUserIds.add(player.userId);
            }
          });
        }
      } else if (winner.startsWith('PLAYER_')) {
        const seatIndex = parseInt(winner.split('_')[1], 10);
        if (!Number.isNaN(seatIndex)) {
          const winningPlayer = players.find((player) => player.seatIndex === seatIndex);
          if (winningPlayer) {
            winningUserIds.add(winningPlayer.userId);
          }
        }
      }
    }

    for (const player of players) {
      if (!player.userId) {
        continue;
      }

      try {
        await this.upsertParticipant(eventId, player.userId, {
          gamesPlayedDelta: 1,
          gamesWonDelta: winningUserIds.has(player.userId) ? 1 : 0,
          milestoneProgress: {
            gamesPlayed: 1,
            ...(winningUserIds.has(player.userId) ? { gamesWon: 1 } : {}),
          },
        });
      } catch (error) {
        console.error('[EVENT SERVICE] Failed to upsert participant stats:', {
          eventId,
          userId: player.userId,
          error: error?.message || error,
        });
      }
    }

    try {
      await prisma.eventGame.updateMany({
        where: {
          eventId,
          gameId,
        },
        data: {
          qualifies: true,
        },
      });
    } catch (error) {
      console.error('[EVENT SERVICE] Failed to mark event game qualified:', {
        eventId,
        gameId,
        error: error?.message || error,
      });
    }
  }
}

export default EventService;

