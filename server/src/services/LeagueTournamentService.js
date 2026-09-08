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
    let tournament = await TournamentService.getTournament(tournamentId);
    if (!tournament || tournament.leagueId !== leagueId) {
      throw httpError('Tournament not found', 404);
    }

    // Clear stale gameIds when the Game row was deleted (broken Watch links)
    for (const match of tournament.matches || []) {
      if (!match.gameId || match.status === 'COMPLETED') continue;
      const exists = await prisma.game.findUnique({
        where: { id: match.gameId },
        select: { id: true }
      });
      if (!exists) {
        await prisma.tournamentMatch.update({
          where: { id: match.id },
          data: { gameId: null, status: 'PENDING' }
        });
      }
    }
    tournament = await TournamentService.getTournament(tournamentId);

    // Upgrade stub double-elim brackets and backfill loser drops / corrected winners
    if (
      tournament.eliminationType === 'DOUBLE' &&
      tournament.status === 'IN_PROGRESS' &&
      this.doubleElimNeedsRepair(tournament)
    ) {
      try {
        const fix = await TournamentBracketService.repairDoubleElimination(tournamentId);
        console.log('[LEAGUE TOURNAMENT] double-elim repair:', fix);
        tournament = await TournamentService.getTournament(tournamentId);
      } catch (e) {
        console.error('[LEAGUE TOURNAMENT] double-elim repair failed:', e.message || e);
      }
    }

    const teamMap = this.buildTeamMap(tournament.registrations || []);
    const teamLabels = await this.buildTeamLabels(tournament);
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
    const partnerDeclines = await prisma.tournamentPartnerDecline.findMany({
      where: { tournamentId },
      select: { fromUserId: true, toUserId: true }
    });
    return { ...tournament, matches, registrationStats: stats, teamLabels, partnerDeclines };
  }

  static doubleElimNeedsRepair(tournament) {
    const matches = tournament.matches || [];
    const wbR1 = matches.filter((m) => m.round === 100);
    if (!wbR1.length) return false;
    const bracketSize = wbR1.length * 2;
    const meta = TournamentBracketService.buildDoubleElimLbMeta(bracketSize);
    const lbRounds = new Set(
      matches
        .filter((m) => m.round > 100 && m.round < 1000 && m.round % 100 !== 0)
        .map((m) => m.round)
    );
    const missingShell = meta.some((m) => !lbRounds.has(m.round));
    const r1Done = wbR1.every((m) => m.status === 'COMPLETED' && m.winnerId);
    const lbFilled = matches.some(
      (m) =>
        m.round > 100 &&
        m.round < 1000 &&
        m.round % 100 !== 0 &&
        (m.team1Id || m.team2Id)
    );
    return missingShell || (r1Done && !lbFilled);
  }

  /** Map team_* ids → "Alice + Bob" using User + registration usernames. */
  static async buildTeamLabels(tournament) {
    const ids = new Set();
    for (const m of tournament.matches || []) {
      for (const tid of [m.team1Id, m.team2Id, m.winnerId]) {
        if (!tid) continue;
        for (const part of tid.replace(/^team_/, '').split('_')) {
          if (part) ids.add(part);
        }
      }
    }
    for (const r of tournament.registrations || []) {
      if (r.userId) ids.add(r.userId);
      if (r.partnerId) ids.add(r.partnerId);
    }

    const users = await prisma.user.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, username: true }
    });
    const nameById = new Map(users.map((u) => [u.id, u.username]));
    for (const r of tournament.registrations || []) {
      if (r.user?.username) nameById.set(r.userId, r.user.username);
      if (r.partner?.username && r.partnerId) nameById.set(r.partnerId, r.partner.username);
    }

    const labels = {};
    const allTeamIds = new Set();
    for (const m of tournament.matches || []) {
      for (const tid of [m.team1Id, m.team2Id, m.winnerId]) {
        if (tid) allTeamIds.add(tid);
      }
    }
    for (const r of tournament.registrations || []) {
      if (r.partnerId && r.isComplete) {
        allTeamIds.add(`team_${r.userId}_${r.partnerId}`);
        allTeamIds.add(`team_${r.partnerId}_${r.userId}`);
      } else if (!r.partnerId && !r.isSub) {
        allTeamIds.add(`team_${r.userId}`);
      }
    }
    for (const tid of allTeamIds) {
      const parts = tid.replace(/^team_/, '').split('_');
      labels[tid] = parts.map((id) => nameById.get(id) || `${id.slice(0, 6)}…`).join(' + ');
    }
    return labels;
  }

  static parseRuleList(value) {
    if (value == null || value === '') return null;
    if (Array.isArray(value)) return value.length ? value : null;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.length ? parsed : null;
      } catch {
        return value.trim() ? [value.trim()] : null;
      }
    }
    return null;
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

    const format = payload.format || 'REGULAR';
    const nilAllowed =
      format === 'REGULAR'
        ? payload.nilAllowed !== 'false' && payload.nilAllowed !== false
        : false;
    const blindNilAllowed =
      format === 'REGULAR'
        ? payload.blindNilAllowed === 'true' || payload.blindNilAllowed === true
        : false;

    try {
      return await TournamentService.createTournament(
        {
          name: payload.name,
          mode: payload.mode || 'PARTNERS',
          format,
          startTime: payload.startTime,
          eliminationType: payload.eliminationType || 'SINGLE',
          buyIn: payload.tableBuyIn ?? payload.buyIn ?? 0,
          tournamentBuyIn: payload.tournamentBuyIn ?? 0,
          minPoints:
            payload.minPoints !== undefined && payload.minPoints !== ''
              ? Number(payload.minPoints)
              : -100,
          maxPoints:
            payload.maxPoints !== undefined && payload.maxPoints !== ''
              ? Number(payload.maxPoints)
              : 500,
          nilAllowed,
          blindNilAllowed,
          gimmickVariant: payload.gimmickVariant || null,
          specialRule1: this.parseRuleList(payload.specialRule1),
          specialRule2: this.parseRuleList(payload.specialRule2),
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

  static async addBots(leagueId, adminId, tournamentId, count) {
    await LeagueService.assertAdmin(leagueId, adminId);
    await this.assertLeagueTournament(leagueId, tournamentId);
    const result = await TournamentService.addBots(tournamentId, count);
    return { ...result, tournament: await this.get(leagueId, tournamentId, adminId) };
  }

  static async startEarly(leagueId, adminId, tournamentId, { botCount = 0, registerAdmin = true } = {}) {
    await LeagueService.assertAdmin(leagueId, adminId);
    await this.assertLeagueTournament(leagueId, tournamentId);
    const result = await TournamentService.startEarly(tournamentId, adminId, {
      botCount,
      registerAdmin
    });
    return {
      ...result,
      tournament: await this.get(leagueId, tournamentId, adminId)
    };
  }

  static async cancel(leagueId, adminId, tournamentId) {
    await LeagueService.assertAdmin(leagueId, adminId);
    await this.assertLeagueTournament(leagueId, tournamentId);
    // League tournaments are removed entirely so admins can recreate cleanly
    await TournamentService.deleteTournament(tournamentId);
    return { deleted: true, id: tournamentId };
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

    // PARTNERS: always register alone. Pair via partner-request, admin-pair, or auto-pair at close.
    if (tournament.mode === 'PARTNERS') {
      await prisma.tournamentRegistration.create({
        data: {
          tournamentId,
          userId,
          partnerId: null,
          isComplete: false,
          isSub: false
        }
      });
      return this.get(leagueId, tournamentId, userId);
    }

    await prisma.tournamentRegistration.create({
      data: {
        tournamentId,
        userId,
        partnerId: null,
        isComplete: true,
        isSub: false
      }
    });

    return this.get(leagueId, tournamentId, userId);
  }

  /** Confirm a partnership both ways (admin or accepted request). */
  static async forceCompletePartnership(tournamentId, userId, partnerId) {
    // Clear pending outgoing requests from either player (before we rewrite their rows)
    await prisma.tournamentRegistration.updateMany({
      where: {
        tournamentId,
        isComplete: false,
        OR: [
          { userId: { in: [userId, partnerId] } },
          { partnerId: { in: [userId, partnerId] } }
        ]
      },
      data: { partnerId: null }
    });
    // Clear sticky declines involving either player
    await prisma.tournamentPartnerDecline.deleteMany({
      where: {
        tournamentId,
        OR: [
          { fromUserId: { in: [userId, partnerId] } },
          { toUserId: { in: [userId, partnerId] } }
        ]
      }
    });
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
  }

  /**
   * Request to partner with another registered player (PARTNERS mode).
   * Uses partnerId + isComplete=false as a pending outgoing request.
   */
  static async requestPartner(leagueId, tournamentId, userId, toUserId) {
    await LeagueService.assertCanPlay(leagueId, userId);
    const tournament = await this.assertLeagueTournament(leagueId, tournamentId);
    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw httpError('Registration is closed');
    }
    if (tournament.mode !== 'PARTNERS') {
      throw httpError('Partner requests are only for PARTNERS tournaments');
    }
    if (!toUserId || toUserId === userId) {
      throw httpError('Pick another registered player');
    }

    const [mine, theirs] = await Promise.all([
      prisma.tournamentRegistration.findUnique({
        where: { tournamentId_userId: { tournamentId, userId } }
      }),
      prisma.tournamentRegistration.findUnique({
        where: { tournamentId_userId: { tournamentId, userId: toUserId } }
      })
    ]);
    if (!mine || mine.isSub) throw httpError('Register first');
    if (!theirs || theirs.isSub) throw httpError('That player is not registered');
    if (mine.isComplete && mine.partnerId) throw httpError('You already have a partner');
    if (theirs.isComplete && theirs.partnerId) throw httpError('That player already has a partner');

    const blocked = await prisma.tournamentPartnerDecline.findFirst({
      where: {
        tournamentId,
        OR: [
          { fromUserId: userId, toUserId },
          { fromUserId: toUserId, toUserId: userId }
        ]
      }
    });
    if (blocked) throw httpError('Partner request was declined');

    // Mutual request → form the team immediately
    if (theirs.partnerId === userId && !theirs.isComplete) {
      await this.forceCompletePartnership(tournamentId, userId, toUserId);
      return this.get(leagueId, tournamentId, userId);
    }

    // New outgoing request replaces any previous pending target
    await prisma.tournamentRegistration.update({
      where: { id: mine.id },
      data: { partnerId: toUserId, isComplete: false, isSub: false }
    });

    try {
      const { io } = await import('../config/server.js');
      if (io) {
        io.to(`league_${leagueId}`).emit('tournament_partner_request', {
          leagueId,
          tournamentId,
          fromUserId: userId,
          toUserId
        });
      }
    } catch (_) {
      /* optional */
    }

    return this.get(leagueId, tournamentId, userId);
  }

  static async cancelPartnerRequest(leagueId, tournamentId, userId) {
    await LeagueService.assertMember(leagueId, userId);
    await this.assertLeagueTournament(leagueId, tournamentId);
    const mine = await prisma.tournamentRegistration.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } }
    });
    if (!mine) throw httpError('Not registered', 404);
    if (mine.isComplete) throw httpError('Partnership already confirmed — unregister to leave');
    if (!mine.partnerId) throw httpError('No pending partner request');

    await prisma.tournamentRegistration.update({
      where: { id: mine.id },
      data: { partnerId: null }
    });
    return this.get(leagueId, tournamentId, userId);
  }

  static async respondPartnerRequest(leagueId, tournamentId, userId, { fromUserId, accept }) {
    await LeagueService.assertCanPlay(leagueId, userId);
    const tournament = await this.assertLeagueTournament(leagueId, tournamentId);
    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw httpError('Registration is closed');
    }
    if (!fromUserId) throw httpError('fromUserId required');

    const [mine, theirs] = await Promise.all([
      prisma.tournamentRegistration.findUnique({
        where: { tournamentId_userId: { tournamentId, userId } }
      }),
      prisma.tournamentRegistration.findUnique({
        where: { tournamentId_userId: { tournamentId, userId: fromUserId } }
      })
    ]);
    if (!mine || mine.isSub) throw httpError('Register first');
    if (!theirs) throw httpError('Request not found', 404);
    if (theirs.partnerId !== userId || theirs.isComplete) {
      throw httpError('No pending request from that player');
    }
    if (mine.isComplete && mine.partnerId) {
      throw httpError('You already have a partner');
    }

    if (!accept) {
      await prisma.tournamentRegistration.update({
        where: { id: theirs.id },
        data: { partnerId: null }
      });
      // Also clear my outgoing to them if any
      if (mine.partnerId === fromUserId && !mine.isComplete) {
        await prisma.tournamentRegistration.update({
          where: { id: mine.id },
          data: { partnerId: null }
        });
      }
      await prisma.tournamentPartnerDecline.upsert({
        where: {
          tournamentId_fromUserId_toUserId: {
            tournamentId,
            fromUserId,
            toUserId: userId
          }
        },
        create: { tournamentId, fromUserId, toUserId: userId },
        update: {}
      });
      try {
        const { io } = await import('../config/server.js');
        if (io) {
          io.to(`league_${leagueId}`).emit('tournament_partner_request', {
            leagueId,
            tournamentId,
            fromUserId,
            toUserId: userId,
            declined: true
          });
        }
      } catch (_) {
        /* optional */
      }
      return this.get(leagueId, tournamentId, userId);
    }

    await this.forceCompletePartnership(tournamentId, fromUserId, userId);
    try {
      const { io } = await import('../config/server.js');
      if (io) {
        io.to(`league_${leagueId}`).emit('tournament_partner_request', {
          leagueId,
          tournamentId,
          fromUserId,
          toUserId: userId,
          accepted: true
        });
      }
    } catch (_) {
      /* optional */
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
      await prisma.tournamentPartnerDecline.deleteMany({
        where: {
          tournamentId,
          OR: [
            { fromUserId: { in: [userId, registration.partnerId] } },
            { toUserId: { in: [userId, registration.partnerId] } }
          ]
        }
      });
    } else {
      // Clear anyone who had a pending request to this user
      await prisma.tournamentRegistration.updateMany({
        where: {
          tournamentId,
          partnerId: userId,
          isComplete: false
        },
        data: { partnerId: null }
      });
      await prisma.tournamentPartnerDecline.deleteMany({
        where: {
          tournamentId,
          OR: [{ fromUserId: userId }, { toUserId: userId }]
        }
      });
      await prisma.tournamentRegistration.delete({ where: { id: registration.id } });
    }

    return this.get(leagueId, tournamentId, userId);
  }

  /**
   * Admin pairs an unpartnered registrant with another member (or marks/clears sub).
   */
  static async adminPairOrSub(
    leagueId,
    adminId,
    tournamentId,
    { userId, partnerId = null, asSub = false, clearSub = false }
  ) {
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

    if (clearSub) {
      await prisma.tournamentRegistration.update({
        where: { id: reg.id },
        data: { isSub: false, partnerId: null, isComplete: false }
      });
      return this.get(leagueId, tournamentId, adminId);
    }

    if (asSub) {
      await prisma.tournamentRegistration.update({
        where: { id: reg.id },
        data: { isSub: true, partnerId: null, isComplete: false }
      });
      return this.get(leagueId, tournamentId, adminId);
    }

    if (!partnerId) throw httpError('partnerId required unless asSub');
    await LeagueService.assertMember(leagueId, partnerId);
    let partnerReg = await prisma.tournamentRegistration.findUnique({
      where: { tournamentId_userId: { tournamentId, userId: partnerId } }
    });
    if (!partnerReg) {
      await prisma.tournamentRegistration.create({
        data: {
          tournamentId,
          userId: partnerId,
          partnerId: null,
          isComplete: false,
          isSub: false
        }
      });
    }
    await this.forceCompletePartnership(tournamentId, userId, partnerId);
    return this.get(leagueId, tournamentId, adminId);
  }

  /**
   * While registration is open: put everyone back in the free pool
   * (clears teams, pending requests, subs, declines). Use after a failed close/auto-pair.
   */
  static async resetOpenPairings(leagueId, adminId, tournamentId) {
    await LeagueService.assertAdmin(leagueId, adminId);
    const tournament = await this.assertLeagueTournament(leagueId, tournamentId);
    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw httpError('Can only reset pairings while registration is open');
    }
    if (tournament.mode !== 'PARTNERS') {
      throw httpError('Only PARTNERS tournaments have pairings to reset');
    }

    await prisma.tournamentRegistration.updateMany({
      where: { tournamentId },
      data: { partnerId: null, isComplete: false, isSub: false }
    });
    await prisma.tournamentPartnerDecline.deleteMany({ where: { tournamentId } });

    return this.get(leagueId, tournamentId, adminId);
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
      throw httpError('Close registration first to pair players and build the bracket');
    }

    const fresh = await TournamentService.getTournament(tournamentId);
    if (!fresh || fresh.status !== 'REGISTRATION_CLOSED') {
      throw httpError('Finalize the bracket before starting (need at least 2 teams)');
    }

    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'IN_PROGRESS' }
    });

    // Open every match that already has both teams (play-in + bye-vs-bye)
    await TournamentService.openPlayableTables(tournamentId);

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
      const game = await this.createMatchTable(leagueId, tournament, match, teamMap);
      await TournamentService.maybeAutostartTournamentGame(game.id);
      await TournamentService.notifyTournamentTableReady(tournament, match, game.id, playerIds);
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
    const game = await this.createMatchTable(leagueId, tournament, match, teamMap);
    await TournamentService.maybeAutostartTournamentGame(game.id);
    const teamMap2 = this.buildTeamMap(tournament.registrations || []);
    const playerIds = this.playersForMatch(match, teamMap2).map((p) => p.id);
    await TournamentService.notifyTournamentTableReady(tournament, match, game.id, playerIds);
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

    const seats =
      tournament.mode === 'PARTNERS'
        ? TournamentService.partnerSeatAssignments(
            [team1[0], team1[1] || team1[0]],
            [team2[0], team2[1] || team2[0]]
          )
        : [
            { userId: team1[0], seatIndex: 0, teamIndex: 0 },
            { userId: team2[0], seatIndex: 1, teamIndex: 1 },
            ...(team1[1] ? [{ userId: team1[1], seatIndex: 2, teamIndex: 0 }] : []),
            ...(team2[1] ? [{ userId: team2[1], seatIndex: 3, teamIndex: 1 }] : [])
          ];

    const gameId = `tournament_${tournament.id}_match_${match.id}`;
    const users = await prisma.user.findMany({
      where: { id: { in: seats.map((s) => s.userId) } }
    });
    const userById = new Map(users.map((u) => [u.id, u]));
    if (users.length !== new Set(seats.map((s) => s.userId)).size) {
      throw httpError('Match players missing from database', 500);
    }

    const existing = await prisma.game.findUnique({ where: { id: gameId } });
    if (existing) {
      if (existing.status === 'WAITING') {
        await TournamentService.seatTournamentPlayers(gameId, seats, userById);
        try {
          const full = await GameService.getFullGameStateFromDatabase(gameId);
          if (full) await redisGameState.setGameState(gameId, full);
        } catch (e) {
          console.error('[LEAGUE TOURNAMENT] Redis cache after re-seat:', e);
        }
      }
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
      isRated: false,
      maxPoints: tournament.maxPoints || 500,
      minPoints: tournament.minPoints || -100,
      buyIn: tournament.buyIn || 0,
      nilAllowed: tournament.nilAllowed !== false,
      blindNilAllowed: tournament.blindNilAllowed || false,
      specialRules: tournament.specialRules || {}
    });

    await TournamentService.seatTournamentPlayers(game.id, seats, userById);

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

    // Open any newly playable tables (both teams now known — e.g. after play-in)
    try {
      await TournamentService.openPlayableTables(tournamentId);
    } catch (e) {
      console.error('[LEAGUE TOURNAMENT] openPlayableTables after match:', e.message || e);
    }

    const completed = await TournamentService.getTournament(tournamentId);
    if (completed?.status === 'COMPLETED') {
      await this.postWinnersAnnouncement(completed);
    }

    return result;
  }

  static resolveWinnerTeamId(match, game) {
    const players = (game?.players || []).filter(
      (p) => p && p.seatIndex != null && !p.isSpectator
    );

    if (game.mode === 'PARTNERS') {
      // Prefer actual final scores over result.winner (older paths wrongly crowned
      // the team that hit minPoints).
      const t0 = game?.result?.team0Final;
      const t1 = game?.result?.team1Final;
      let winParity = null;
      if (typeof t0 === 'number' && typeof t1 === 'number' && t0 !== t1) {
        winParity = t0 > t1 ? 0 : 1;
      } else {
        const winner = game?.result?.winner;
        if (winner === undefined || winner === null) return null;
        winParity =
          Number(winner) === 0 || winner === 'TEAM_0' || winner === '0' ? 0 : 1;
      }

      const winningUserIds = new Set(
        players.filter((p) => p.seatIndex % 2 === winParity).map((p) => p.userId)
      );

      const scoreSide = (teamId) => {
        if (!teamId) return 0;
        const ids = TournamentBracketService.parseTeamPlayerIds(teamId);
        return ids.filter((id) => winningUserIds.has(id)).length;
      };

      const s1 = scoreSide(match.team1Id);
      const s2 = scoreSide(match.team2Id);
      if (s1 > s2) return match.team1Id;
      if (s2 > s1) return match.team2Id;

      return this.matchTeamId(match, [...winningUserIds]);
    }

    const winner = game?.result?.winner;
    if (winner === undefined || winner === null) return null;

    // Solo: winner is team index / player
    const winIdx = typeof winner === 'number' ? winner : Number(String(winner).replace(/\D/g, ''));
    const winnerPlayer =
      players.find((p) => p.teamIndex === winIdx) ||
      players.find((p) => p.seatIndex === winIdx) ||
      players[winIdx];
    if (!winnerPlayer) return null;
    return this.matchTeamId(match, [winnerPlayer.userId]);
  }

  static matchTeamId(match, playerIds) {
    const set = new Set(playerIds.filter(Boolean));
    const candidates = [match.team1Id, match.team2Id].filter(Boolean);
    if (!set.size || !candidates.length) return null;

    let best = null;
    let bestCount = -1;
    for (const c of candidates) {
      const ids = TournamentBracketService.parseTeamPlayerIds(c);
      const overlap = ids.filter((id) => set.has(id)).length;
      if (overlap > bestCount) {
        bestCount = overlap;
        best = c;
      }
    }
    return bestCount > 0 ? best : null;
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
