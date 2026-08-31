import { prisma } from '../config/databaseFirst.js';
import { LeagueService } from './LeagueService.js';
import { EventService } from './EventService.js';
import { LeagueAnnouncementService } from './LeagueAnnouncementService.js';

const CRITERION_LABELS = {
  MOST_WINS: 'Most wins',
  MOST_GAMES_PLAYED: 'Most games played',
  MOST_LOSSES: 'Most losses',
  HIGHEST_WIN_PERCENT: 'Highest win %',
  GAMES_PLAYED_MILESTONE: 'Games played milestone',
  GAMES_WON_MILESTONE: 'Games won milestone'
};

export class LeagueEventService {
  static async list(leagueId, viewerId) {
    await LeagueService.assertMember(leagueId, viewerId);
    await this.syncStatusesForLeague(leagueId);

    const events = await prisma.event.findMany({
      where: { leagueId },
      orderBy: [{ startsAt: 'desc' }],
      include: {
        criteria: true,
        _count: { select: { participants: true, Game: true } }
      }
    });
    return events;
  }

  static async get(leagueId, eventId, viewerId) {
    await LeagueService.assertMember(leagueId, viewerId);
    await this.syncEventStatus(eventId);

    const event = await prisma.event.findFirst({
      where: { id: eventId, leagueId },
      include: {
        criteria: true,
        participants: {
          include: {
            User: { select: { id: true, username: true, avatarUrl: true } }
          },
          orderBy: [{ gamesWon: 'desc' }, { winPercent: 'desc' }]
        }
      }
    });
    if (!event) {
      const err = new Error('Event not found');
      err.status = 404;
      throw err;
    }

    const leaderboard = this.buildLeaderboard(event);
    return { ...event, leaderboard };
  }

  static async create(leagueId, adminId, payload) {
    await LeagueService.assertAdmin(leagueId, adminId);
    const criteria = Array.isArray(payload.criteria) ? payload.criteria : [];
    if (criteria.length === 0) {
      const err = new Error('Add at least one prize criterion');
      err.status = 400;
      throw err;
    }

    try {
      const event = await EventService.createEvent(
        {
          name: payload.name,
          description: payload.description || null,
          timezone: payload.timezone || 'UTC',
          startsAt: payload.startsAt,
          endsAt: payload.endsAt,
          bannerUrl: payload.bannerUrl || null,
          filters: payload.filters || null,
          criteria,
          leagueId
        },
        adminId
      );
      return event;
    } catch (error) {
      error.status = error.status || 400;
      throw error;
    }
  }

  static async cancel(leagueId, adminId, eventId) {
    await LeagueService.assertAdmin(leagueId, adminId);
    const event = await prisma.event.findFirst({ where: { id: eventId, leagueId } });
    if (!event) {
      const err = new Error('Event not found');
      err.status = 404;
      throw err;
    }
    return EventService.updateEventStatus(eventId, 'CANCELLED');
  }

  static buildLeaderboard(event) {
    const rows = (event.participants || []).map((p) => {
      const played = p.gamesPlayed || 0;
      const won = p.gamesWon || 0;
      return {
        user: p.User,
        played,
        won,
        lost: Math.max(0, played - won),
        winPercent: p.winPercent || 0,
        milestoneProgress: p.milestoneProgress
      };
    });

    const byCriterion = (event.criteria || []).map((c) => {
      const ranked = [...rows].sort((a, b) => {
        const av = this.metricFor(c.type, a);
        const bv = this.metricFor(c.type, b);
        return bv - av;
      });
      let winners = [];
      if (c.type === 'GAMES_PLAYED_MILESTONE' || c.type === 'GAMES_WON_MILESTONE') {
        const need = Number(c.milestoneValue) || 0;
        winners = ranked.filter((r) => this.metricFor(c.type, r) >= need);
      } else if (ranked.length) {
        const top = this.metricFor(c.type, ranked[0]);
        winners = ranked.filter((r) => this.metricFor(c.type, r) === top && top > 0);
      }
      return {
        criterionId: c.id,
        type: c.type,
        label: CRITERION_LABELS[c.type] || c.type,
        rewardCoins: c.rewardCoins,
        milestoneValue: c.milestoneValue,
        winners: winners.map((w) => ({
          user: w.user,
          value: this.metricFor(c.type, w)
        }))
      };
    });

    return { rows, byCriterion };
  }

  static metricFor(type, row) {
    switch (type) {
      case 'MOST_WINS':
      case 'GAMES_WON_MILESTONE':
        return row.won;
      case 'MOST_GAMES_PLAYED':
      case 'GAMES_PLAYED_MILESTONE':
        return row.played;
      case 'MOST_LOSSES':
        return row.lost;
      case 'HIGHEST_WIN_PERCENT':
        return row.winPercent;
      default:
        return 0;
    }
  }

  static async syncStatusesForLeague(leagueId) {
    const events = await prisma.event.findMany({
      where: {
        leagueId,
        status: { in: ['SCHEDULED', 'ACTIVE'] }
      },
      select: { id: true }
    });
    for (const e of events) {
      await this.syncEventStatus(e.id);
    }
  }

  static async syncEventStatus(eventId) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { criteria: true, participants: { include: { User: { select: { id: true, username: true } } } } }
    });
    if (!event || !event.leagueId) return event;
    if (event.status === 'CANCELLED' || event.status === 'COMPLETED') return event;

    const next = EventService.determineInitialStatus(event.startsAt, event.endsAt);
    if (next === event.status) return event;

    const updated = await prisma.event.update({
      where: { id: eventId },
      data: { status: next },
      include: { criteria: true, participants: { include: { User: { select: { id: true, username: true } } } } }
    });

    if (next === 'COMPLETED' && event.status === 'ACTIVE') {
      await this.postWinnersAnnouncement(updated);
    }
    return updated;
  }

  static async postWinnersAnnouncement(event) {
    try {
      const board = this.buildLeaderboard(event);
      const lines = [`🏆 Event finished: ${event.name}`, ''];
      for (const c of board.byCriterion) {
        const prize = `${Number(c.rewardCoins).toLocaleString()} coins`;
        if (!c.winners.length) {
          lines.push(`${c.label} (${prize}): no winner`);
          continue;
        }
        const names = c.winners.map((w) => w.user?.username || 'Player').join(', ');
        lines.push(`${c.label} (${prize}): ${names}`);
      }
      lines.push('', 'Admins: credit winners from the league wallet.');

      // Post as league owner so assertAdmin passes
      const league = await prisma.league.findUnique({
        where: { id: event.leagueId },
        select: { ownerId: true }
      });
      if (!league) return;

      await LeagueAnnouncementService.create(event.leagueId, league.ownerId, {
        title: `Event results: ${event.name}`,
        body: lines.join('\n')
      });
    } catch (error) {
      console.error('[LEAGUE EVENT] Failed to post winners announcement:', error);
    }
  }

  /** Hourly/periodic: advance all league events. */
  static async tickAllLeagueEvents() {
    const due = await prisma.event.findMany({
      where: {
        leagueId: { not: null },
        status: { in: ['SCHEDULED', 'ACTIVE'] }
      },
      select: { id: true }
    });
    for (const e of due) {
      try {
        await this.syncEventStatus(e.id);
      } catch (error) {
        console.error(`[LEAGUE EVENT] sync failed for ${e.id}:`, error);
      }
    }
    return { checked: due.length };
  }
}
