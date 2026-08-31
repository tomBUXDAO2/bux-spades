import { prisma } from '../config/databaseFirst.js';
import { LeagueService } from './LeagueService.js';
import { DetailedStatsService } from './DetailedStatsService.js';

const SORT_FIELDS = new Set(['played', 'won', 'lost', 'winRate', 'bags', 'nilRate']);

export class LeagueStatsService {
  static async getStandings(leagueId, viewerId, query = {}) {
    await LeagueService.assertMember(leagueId, viewerId);

    const mode = query.mode || 'ALL';
    const format = query.format || 'ALL';
    const sortBy = SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'winRate';
    const sortDir = query.sortDir === 'asc' ? 'asc' : 'desc';
    const minGames = Math.max(0, Math.floor(Number(query.minGames) || 0));
    const search = String(query.search || '').trim().toLowerCase();

    const members = await prisma.leagueMember.findMany({
      where: { leagueId },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } }
      }
    });

    const filters = { mode, format, leagueId };
    const rows = await Promise.all(
      members.map(async (m) => {
        const gameStats = await DetailedStatsService.getGameStats(m.userId, {
          status: 'FINISHED',
          leagueId,
          ...(mode !== 'ALL' ? { mode } : {}),
          ...(format !== 'ALL' ? { format } : {})
        });
        const bagsStats = await DetailedStatsService.getBagsStats(m.userId, {
          status: 'FINISHED',
          leagueId,
          ...(mode !== 'ALL' ? { mode } : {}),
          ...(format !== 'ALL' ? { format } : {})
        });
        const nilStats = await DetailedStatsService.getNilStats(m.userId, {
          status: 'FINISHED',
          leagueId,
          ...(mode !== 'ALL' ? { mode } : {}),
          ...(format !== 'ALL' ? { format } : {})
        });

        const played = gameStats.totalGames || 0;
        const won = gameStats.gamesWon || 0;
        const lost = Math.max(0, played - won);
        const winRate = played > 0 ? (won / played) * 100 : 0;

        return {
          user: m.user,
          role: m.role,
          played,
          won,
          lost,
          winRate: Math.round(winRate * 10) / 10,
          bags: bagsStats.totalBags || 0,
          bagsPerGame: bagsStats.bagsPerGame || 0,
          nilsBid: nilStats.nilsBid || 0,
          nilsMade: nilStats.nilsMade || 0,
          nilRate: nilStats.nilRate || 0
        };
      })
    );

    let filtered = rows.filter((r) => r.played >= minGames);
    if (search) {
      filtered = filtered.filter((r) =>
        String(r.user.username || '')
          .toLowerCase()
          .includes(search)
      );
    }

    filtered.sort((a, b) => {
      const av = Number(a[sortBy] ?? 0);
      const bv = Number(b[sortBy] ?? 0);
      if (av === bv) {
        return String(a.user.username || '').localeCompare(String(b.user.username || ''));
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });

    return {
      standings: filtered,
      filters: { leagueId, mode, format, sortBy, sortDir, minGames, search }
    };
  }
}
