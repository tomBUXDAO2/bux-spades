import { prisma } from '../config/databaseFirst.js';
import { LeagueService } from './LeagueService.js';
import { TournamentService } from './TournamentService.js';
import { TournamentBracketService } from './TournamentBracketService.js';
import { TournamentReadyService } from './TournamentReadyService.js';
import { LeagueAnnouncementService } from './LeagueAnnouncementService.js';

const READY_WINDOW_MS = 10 * 60 * 1000; // T-10 roll call window
const ROLL_CALL_LEAD_MS = 10 * 60 * 1000;

function httpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export class LeagueTournamentService {
  static async assertLeagueTournament(leagueId, tournamentId) {
    const tournament = await prisma.tournament.findFirst({
      where: { id: tournamentId, leagueId }
    });
    if (!tournament) throw httpError('Tournament not found', 404);
    return tournament;
  }

  static async list(leagueId, viewerId) {
    await LeagueService.assertMember(leagueId, viewerId);
    await this.tickLeague(leagueId);
    return TournamentService.getTournaments({ leagueId, limit: 100 });
  }

  static async get(leagueId, tournamentId, viewerId) {
    await LeagueService.assertMember(leagueId, viewerId);
    await this.assertLeagueTournament(leagueId, tournamentId);
    const tournament = await TournamentService.getTournament(tournamentId);
    if (!tournament || tournament.leagueId !== leagueId) {
      throw httpError('Tournament not found', 404);
    }

    const teamMap = this.buildTeamMap(tournament.registrations || []);
    const matches = [];
    for (const match of tournament.matches || []) {
      const players = this.playersForMatch(match, teamMap);
      let ready = { ready: [], timeRemaining: null };
      if (match.status === 'PENDING' && tournament.status === 'IN_PROGRESS' && !match.gameId) {
        const status = await TournamentReadyService.getReadyStatus(match.id);
        const timeRemaining = await TournamentReadyService.getTimeRemaining(match.id);
        ready = { ready: status.ready || [], timeRemaining };
      }
      matches.push({
        ...match,
        players,
        ready
      });
    }

    const stats = await TournamentService.getRegistrationStats(tournamentId);
    return { ...tournament, matches, registrationStats: stats };
  }

  static async create(leagueId, adminId, payload) {
    await LeagueService.assertAdmin(leagueId, adminId);
    const prizes = {
      firstPlaceCoins: Math.max(0, Math.floor(Number(payload.firstPlaceCoins) || 0)),
      secondPlaceCoins: Math.max(0, Math.floor(Number(payload.secondPlaceCoins) || 0))
    };
    if (prizes.firstPlaceCoins <= 0 && prizes.secondPlaceCoins <= 0) {
      throw httpError('Declare at least one prize amount (coins)');
    }

    try {
      return await TournamentService.createTournament(
        {
          name: payload.name,
          mode: payload.mode || 'PARTNERS',
          format: payload.format || 'REGULAR',
          startTime: payload.startTime,
          eliminationType: payload.eliminationType || 'SINGLE',
          buyIn: payload.buyIn ?? 0,
          tournamentBuyIn: payload.tournamentBuyIn ?? 0,
          minPoints: payload.minPoints ?? -100,
          maxPoints: payload.maxPoints ?? 500,
          nilAllowed: payload.nilAllowed !== false,
          blindNilAllowed: Boolean(payload.blindNilAllowed),
          gimmickVariant: payload.gimmickVariant || null,
          specialRule1: payload.specialRule1 || null,
          specialRule2: payload.specialRule2 || null,
          bannerUrl: payload.bannerUrl || null,
          prizes,
          leagueId
        },
        adminId
      );
    } catch (error) {
      error.status = error.status || 400;
      throw error;
    }
  }

  static async cancel(leagueId, adminId, tournamentId) {
    await LeagueService.assertAdmin(leagueId, adminId);
    await this.assertLeagueTournament(leagueId, tournamentId);
    return TournamentService.cancelTournament(tournamentId);
  }

  static async register(leagueId, tournamentId, userId, { partnerId = null } = {}) {
    await LeagueService.assertCanPlay(leagueId, userId);
    const tournament = await this.assertLeagueTournament(leagueId, tournamentId);
    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw httpError('Registration is closed');
    }

    const existing = await prisma.tournamentRegistration.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } }
    });
    if (existing) throw httpError('Already registered');

    if (partnerId) {
      if (partnerId === userId) throw httpError('Cannot partner with yourself');
      await LeagueService.assertMember(leagueId, partnerId);
      const partnerExisting = await prisma.tournamentRegistration.findUnique({
        where: { tournamentId_userId: { tournamentId, userId: partnerId } }
      });
      if (partnerExisting?.partnerId && partnerExisting.isComplete) {
        throw httpError('That player already has a partner');
      }
      if (partnerExisting && partnerExisting.userId !== partnerId) {
        throw httpError('Partner already registered');
      }

      await prisma.tournamentRegistration.deleteMany({
        where: {
          tournamentId,
          userId: { in: [userId, partnerId] }
        }
      });

      await prisma.tournamentRegistration.createMany({
        data: [
          {
            tournamentId,
            userId,
            partnerId,
            isComplete: true,
            isSub: false
          },
          {
            tournamentId,
            userId: partnerId,
            partnerId: userId,
            isComplete: true,
            isSub: false
          }
        ]
      });
    } else {
      await prisma.tournamentRegistration.create({
        data: {
          tournamentId,
          userId,
          partnerId: null,
          isComplete: tournament.mode === 'SOLO',
          isSub: false
        }
      });
    }

    return this.get(leagueId, tournamentId, userId);
  }

  static async unregister(leagueId, tournamentId, userId) {
    await LeagueService.assertMember(leagueId, userId);
    const tournament = await this.assertLeagueTournament(leagueId, tournamentId);
    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw httpError('Registration is closed');
    }

    const registration = await prisma.tournamentRegistration.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } }
    });
    if (!registration) throw httpError('Not registered', 404);

    if (registration.partnerId && registration.isComplete) {
      await prisma.tournamentRegistration.deleteMany({
        where: {
          tournamentId,
          OR: [{ userId }, { userId: registration.partnerId }]
        }
      });
    } else {
      await prisma.tournamentRegistration.delete({ where: { id: registration.id } });
    }

    return this.get(leagueId, tournamentId, userId);
  }

  /**
   * Admin pairs an unpartnered registrant with another member (or marks as sub).
   */
  static async adminPairOrSub(leagueId, adminId, tournamentId, { userId, partnerId = null, asSub = false }) {
    await LeagueService.assertAdmin(leagueId, adminId);
    const tournament = await this.assertLeagueTournament(leagueId, tournamentId);
    if (!['REGISTRATION_OPEN', 'REGISTRATION_CLOSED'].includes(tournament.status)) {
      throw httpError('Cannot change pairings in this status');
    }
    if (tournament.status === 'REGISTRATION_CLOSED') {
      throw httpError('Bracket already finalized — cancel and recreate to change pairings');
    }

    const reg = await prisma.tournamentRegistration.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } }
    });
    if (!reg) throw httpError('Player is not registered', 404);

    if (asSub) {
      await prisma.tournamentRegistration.update({
        where: { id: reg.id },
        data: { isSub: true, partnerId: null, isComplete: false }
      });
      return this.get(leagueId, tournamentId, adminId);
    }

    if (!partnerId) throw httpError('partnerId required unless asSub');
    await LeagueService.assertMember(leagueId, partnerId);
    return this.register(leagueId, tournamentId, userId, { partnerId }).catch(async (err) => {
      // register refuses if already registered — clear and re-pair
      if (String(err.message).includes('Already registered')) {
        await this.unregister(leagueId, tournamentId, userId).catch(() => undefined);
        if (reg.partnerId) {
          await this.unregister(leagueId, tournamentId, reg.partnerId).catch(() => undefined);
        }
        await this.unregister(leagueId, tournamentId, partnerId).catch(() => undefined);
        await prisma.tournamentRegistration.create({
          data: { tournamentId, userId, isComplete: false }
        }).catch(() => undefined);
        return this.register(leagueId, tournamentId, userId, { partnerId });
      }
      throw err;
    });
  }

  static async closeRegistration(leagueId, adminId, tournamentId) {
    await LeagueService.assertAdmin(leagueId, adminId);
    await this.assertLeagueTournament(leagueId, tournamentId);
    try {
      await TournamentBracketService.generateBracket(tournamentId);
      return this.get(leagueId, tournamentId, adminId);
    } catch (error) {
      error.status = error.status || 400;
      throw error;
    }
  }

  static async start(leagueId, adminId, tournamentId) {
    await LeagueService.assertAdmin(leagueId, adminId);
    const tournament = await this.assertLeagueTournament(leagueId, tournamentId);

    if (tournament.status === 'REGISTRATION_OPEN') {
      await TournamentBracketService.generateBracket(tournamentId);
    }

    const fresh = await TournamentService.getTournament(tournamentId);
    if (!fresh || fresh.status !== 'REGISTRATION_CLOSED') {
      throw httpError('Finalize the bracket before starting (need at least 2 teams)');
    }

    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'IN_PROGRESS' }
    });

    const pending = (fresh.matches || []).filter(
      (m) =>
        m.team1Id &&
        m.team2Id &&
        m.status === 'PENDING' &&
        !m.gameId &&
        (m.round === 1 || m.round === 100)
    );
    for (const match of pending) {
      await this.openRollCall(match.id);
    }

    return this.get(leagueId, tournamentId, adminId);
  }

  static async openRollCall(matchId) {
    const expiry = Date.now() + READY_WINDOW_MS;
    await TournamentReadyService.setTimer(matchId, expiry);
    // Seed empty ready set
    await TournamentReadyService.getReadyStatus(matchId);
  }

  static async markReady(leagueId, tournamentId, matchId, userId) {
    await LeagueService.assertCanPlay(leagueId, userId);
    await this.assertLeagueTournament(leagueId, tournamentId);

    const match = await prisma.tournamentMatch.findFirst({
      where: { id: matchId, tournamentId }
    });
    if (!match) throw httpError('Match not found', 404);
    if (match.status !== 'PENDING' || match.gameId) {
      throw httpError('Match is not awaiting ready');
    }

    const tournament = await TournamentService.getTournament(tournamentId);
    const teamMap = this.buildTeamMap(tournament.registrations || []);
    const players = this.playersForMatch(match, teamMap);
    const playerIds = players.map((p) => p.id);
    if (!playerIds.includes(userId)) {
      throw httpError('You are not in this match');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    await TournamentReadyService.markPlayerReady(matchId, userId, user?.discordId || userId);

    const allReady = await TournamentReadyService.areAllPlayersReady(matchId, playerIds);
    if (allReady && playerIds.length >= 2) {
      await this.createMatchTable(leagueId, tournament, match, teamMap);
    }

    return this.get(leagueId, tournamentId, userId);
  }

  /** Admin opens the match table even if not everyone readied. */
  static async forceOpenTable(leagueId, adminId, tournamentId, matchId) {
    await LeagueService.assertAdmin(leagueId, adminId);
    await this.assertLeagueTournament(leagueId, tournamentId);
    const tournament = await TournamentService.getTournament(tournamentId);
    const match = (tournament.matches || []).find((m) => m.id === matchId);
    if (!match) throw httpError('Match not found', 404);
    if (match.gameId) throw httpError('Table already open');
    const teamMap = this.buildTeamMap(tournament.registrations || []);
    await this.createMatchTable(leagueId, tournament, match, teamMap);
    return this.get(leagueId, tournamentId, adminId);
  }

  static buildTeamMap(registrations) {
    const teamIdToPlayerIds = new Map();
    const processed = new Set();

    for (const reg of registrations) {
      if (processed.has(reg.id)) continue;
      if (reg.partnerId && reg.isComplete) {
        const partner = registrations.find(
          (r) => r.userId === reg.partnerId && r.partnerId === reg.userId
        );
        const teamId = `team_${reg.userId}_${reg.partnerId}`;
        const altId = `team_${reg.partnerId}_${reg.userId}`;
        const players = [reg.userId, reg.partnerId];
        teamIdToPlayerIds.set(teamId, players);
        teamIdToPlayerIds.set(altId, players);
        processed.add(reg.id);
        if (partner) processed.add(partner.id);
      } else if (!reg.partnerId && !reg.isSub) {
        teamIdToPlayerIds.set(`team_${reg.userId}`, [reg.userId]);
        processed.add(reg.id);
      }
    }
    return teamIdToPlayerIds;
  }

  static playersForMatch(match, teamMap) {
    const t1 = teamMap.get(match.team1Id) || [];
    const t2 = match.team2Id ? teamMap.get(match.team2Id) || [] : [];
    const ids = [...t1, ...t2];
    return ids.map((id) => ({ id }));
  }

  static async createMatchTable(leagueId, tournament, match, teamMap) {
    const { GameService } = await import('./GameService.js');
    const { redisGameState } = await import('./RedisGameStateService.js');

    const team1 = teamMap.get(match.team1Id) || [];
    const team2 = match.team2Id ? teamMap.get(match.team2Id) || [] : [];
    if (team1.length === 0 || team2.length === 0) {
      throw httpError('Match is missing teams');
    }

    // Partners seats: team1 in 0,1 — team2 in 2,3 (matches Discord tournament seating)
    const seats =
      tournament.mode === 'PARTNERS'
        ? [
            { userId: team1[0], seatIndex: 0, teamIndex: 0 },
            { userId: team1[1] || team1[0], seatIndex: 1, teamIndex: 0 },
            { userId: team2[0], seatIndex: 2, teamIndex: 1 },
            { userId: team2[1] || team2[0], seatIndex: 3, teamIndex: 1 }
          ]
        : [
            { userId: team1[0], seatIndex: 0, teamIndex: 0 },
            { userId: team2[0], seatIndex: 1, teamIndex: 1 },
            ...(team1[1] ? [{ userId: team1[1], seatIndex: 2, teamIndex: 2 }] : []),
            ...(team2[1] ? [{ userId: team2[1], seatIndex: 3, teamIndex: 3 }] : [])
          ];

    const gameId = `tournament_${tournament.id}_match_${match.id}`;
    const existing = await prisma.game.findUnique({ where: { id: gameId } });
    if (existing) {
      await prisma.tournamentMatch.update({
        where: { id: match.id },
        data: { gameId, status: 'IN_PROGRESS' }
      });
      return existing;
    }

    const game = await GameService.createGame({
      id: gameId,
      createdById: seats[0].userId,
      mode: tournament.mode,
      format: tournament.format,
      gimmickVariant: tournament.gimmickVariant,
      leagueId,
      isLeague: false,
      isRated: true,
      maxPoints: tournament.maxPoints || 500,
      minPoints: tournament.minPoints || -100,
      buyIn: tournament.buyIn || 0,
      nilAllowed: tournament.nilAllowed !== false,
      blindNilAllowed: tournament.blindNilAllowed || false,
      specialRules: tournament.specialRules || {}
    });

    for (let i = 1; i < seats.length; i++) {
      const s = seats[i];
      await prisma.gamePlayer.create({
        data: {
          gameId: game.id,
          userId: s.userId,
          seatIndex: s.seatIndex,
          teamIndex: s.teamIndex,
          isHuman: true,
          joinedAt: new Date()
        }
      });
    }

    // Ensure seat 0 teamIndex matches
    await prisma.gamePlayer.updateMany({
      where: { gameId: game.id, seatIndex: 0 },
      data: { teamIndex: seats[0].teamIndex }
    });

    await prisma.tournamentMatch.update({
      where: { id: match.id },
      data: { gameId: game.id, status: 'IN_PROGRESS' }
    });

    await TournamentReadyService.clearReadyStatus(match.id);

    try {
      const full = await GameService.getFullGameStateFromDatabase(game.id);
      if (full) await redisGameState.setGameState(game.id, full);
    } catch (e) {
      console.error('[LEAGUE TOURNAMENT] Redis cache after match table:', e);
    }

    return game;
  }

  /**
   * Called from ScoringService when a tournament_* game finishes.
   */
  static async handleMatchGameComplete(gameId, game) {
    if (!gameId?.startsWith('tournament_')) return null;
    const parts = gameId.replace('tournament_', '').split('_match_');
    if (parts.length !== 2) return null;
    const [tournamentId, matchId] = parts;

    const match = await prisma.tournamentMatch.findUnique({
      where: { id: matchId },
      include: { tournament: true }
    });
    if (!match || match.tournamentId !== tournamentId) return null;
    if (!match.tournament?.leagueId) return null; // Discord path handles global
    if (match.status === 'COMPLETED') return null;

    const winnerTeamId = this.resolveWinnerTeamId(match, game);
    if (!winnerTeamId) {
      console.error('[LEAGUE TOURNAMENT] Could not resolve winner for', gameId);
      return null;
    }

    const result = await TournamentBracketService.recordMatchResult(
      tournamentId,
      matchId,
      winnerTeamId
    );

    // Open roll call when the next match now has both teams
    const nextMatch = result?.advanceResult?.nextMatch;
    if (nextMatch?.team1Id && nextMatch?.team2Id && !nextMatch.gameId) {
      await this.openRollCall(nextMatch.id);
    }

    const completed = await TournamentService.getTournament(tournamentId);
    if (completed?.status === 'COMPLETED') {
      await this.postWinnersAnnouncement(completed);
    }

    return result;
  }

  static resolveWinnerTeamId(match, game) {
    const winner = game?.result?.winner;
    const players = game?.players || [];
    if (winner === undefined || winner === null) return null;

    if (game.mode === 'PARTNERS') {
      const team0 = players.filter((p) => p.teamIndex === 0).map((p) => p.userId);
      const team1 = players.filter((p) => p.teamIndex === 1).map((p) => p.userId);
      const winningIds = Number(winner) === 0 || winner === 'TEAM_0' ? team0 : team1;
      return this.matchTeamId(match, winningIds);
    }

    // Solo: winner is team index / player
    const winIdx = typeof winner === 'number' ? winner : Number(String(winner).replace(/\D/g, ''));
    const winnerPlayer = players.find((p) => p.teamIndex === winIdx) || players[winIdx];
    if (!winnerPlayer) return null;
    return this.matchTeamId(match, [winnerPlayer.userId]);
  }

  static matchTeamId(match, playerIds) {
    const set = new Set(playerIds.filter(Boolean));
    const candidates = [match.team1Id, match.team2Id].filter(Boolean);
    for (const id of candidates) {
      const parts = id.replace(/^team_/, '').split('_');
      if (parts.length === 1 && set.size === 1 && set.has(parts[0])) return id;
      if (parts.length >= 2) {
        const a = parts[0];
        const b = parts.slice(1).join('_'); // ids are cuid without underscore usually
        // cuid has no underscores — team_${id1}_${id2}
        const ids = id.replace(/^team_/, '').split('_');
        if (ids.length === 2 && set.has(ids[0]) && set.has(ids[1]) && set.size === 2) {
          return id;
        }
        if (ids.length === 1 && set.has(ids[0])) return id;
        void a;
        void b;
      }
    }
    // Fallback: reconstruct from sorted seat order
    if (playerIds.length === 1) {
      const tid = `team_${playerIds[0]}`;
      if (candidates.includes(tid)) return tid;
      return tid;
    }
    for (const c of candidates) {
      const ids = c.replace(/^team_/, '').split('_');
      if (ids.every((id) => set.has(id)) && ids.length === set.size) return c;
    }
    return candidates[0] || null;
  }

  static async postWinnersAnnouncement(tournament) {
    try {
      if (!tournament.leagueId) return;
      const prizes = tournament.prizes || {};
      const finalMatch = (tournament.matches || [])
        .filter((m) => m.status === 'COMPLETED' && m.winnerId)
        .sort((a, b) => b.round - a.round)[0];
      const winnerTeamId = finalMatch?.winnerId;
      const teamMap = this.buildTeamMap(tournament.registrations || []);
      const winnerIds = winnerTeamId ? teamMap.get(winnerTeamId) || [] : [];
      const users = await prisma.user.findMany({
        where: { id: { in: winnerIds } },
        select: { username: true }
      });
      const names = users.map((u) => u.username).join(' & ') || 'Winner';

      const runnerMatch = (tournament.matches || []).find(
        (m) => m.id === finalMatch?.id && m.winnerId
      );
      let runnerNames = '';
      if (runnerMatch) {
        const loserId =
          runnerMatch.team1Id === winnerTeamId ? runnerMatch.team2Id : runnerMatch.team1Id;
        const loserIds = loserId ? teamMap.get(loserId) || [] : [];
        const runners = await prisma.user.findMany({
          where: { id: { in: loserIds } },
          select: { username: true }
        });
        runnerNames = runners.map((u) => u.username).join(' & ');
      }

      const lines = [`🏆 Tournament finished: ${tournament.name}`, '', `Winner: ${names}`];
      if (prizes.firstPlaceCoins) {
        lines.push(`1st prize: ${Number(prizes.firstPlaceCoins).toLocaleString()} coins`);
      }
      if (runnerNames) {
        lines.push(`Runner-up: ${runnerNames}`);
        if (prizes.secondPlaceCoins) {
          lines.push(`2nd prize: ${Number(prizes.secondPlaceCoins).toLocaleString()} coins`);
        }
      }
      lines.push('', 'Admins: credit winners from the league wallet.');

      const league = await prisma.league.findUnique({
        where: { id: tournament.leagueId },
        select: { ownerId: true }
      });
      if (!league) return;

      await LeagueAnnouncementService.create(tournament.leagueId, league.ownerId, {
        title: `Tournament results: ${tournament.name}`,
        body: lines.join('\n')
      });
    } catch (error) {
      console.error('[LEAGUE TOURNAMENT] Failed to post winners announcement:', error);
    }
  }

  /** Auto-close registration at T-10 for league tournaments. */
  static async tickAll() {
    const now = new Date();
    const cutoff = new Date(now.getTime() + ROLL_CALL_LEAD_MS);
    const due = await prisma.tournament.findMany({
      where: {
        leagueId: { not: null },
        status: 'REGISTRATION_OPEN',
        startTime: { lte: cutoff }
      },
      select: { id: true, leagueId: true }
    });
    for (const t of due) {
      try {
        await TournamentBracketService.generateBracket(t.id);
        console.log(`[LEAGUE TOURNAMENT] Auto-closed registration for ${t.id}`);
      } catch (error) {
        console.error(`[LEAGUE TOURNAMENT] Auto-close failed for ${t.id}:`, error.message);
      }
    }
    return { checked: due.length };
  }

  static async tickLeague(leagueId) {
    const now = new Date();
    const cutoff = new Date(now.getTime() + ROLL_CALL_LEAD_MS);
    const due = await prisma.tournament.findMany({
      where: {
        leagueId,
        status: 'REGISTRATION_OPEN',
        startTime: { lte: cutoff }
      },
      select: { id: true }
    });
    for (const t of due) {
      try {
        await TournamentBracketService.generateBracket(t.id);
      } catch {
        /* not enough teams yet */
      }
    }
  }
}
