import { prisma } from '../config/database.js';

export class TournamentService {
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

  static async createTournament(data, createdById) {
    const {
      name,
      mode,
      format,
      startTime,
      buyIn, // Table buy-in (game cost)
      tournamentBuyIn, // Tournament entry fee
      eliminationType = 'SINGLE',
      prizes = null,
      bannerUrl = null,
      // Game settings
      minPoints = -100,
      maxPoints = 500,
      nilAllowed = true,
      blindNilAllowed = false,
      gimmickVariant = null,
      specialRule1 = null,
      specialRule2 = null,
      leagueId = null,
    } = data || {};

    if (!name || typeof name !== 'string') {
      throw new Error('Tournament name is required');
    }

    if (!mode || !['PARTNERS', 'SOLO'].includes(mode)) {
      throw new Error('Tournament mode must be PARTNERS or SOLO');
    }

    if (!format || !['REGULAR', 'WHIZ', 'MIRROR', 'GIMMICK'].includes(format)) {
      throw new Error('Tournament format is required');
    }

    if (!eliminationType || !['SINGLE', 'DOUBLE'].includes(eliminationType)) {
      throw new Error('Elimination type must be SINGLE or DOUBLE');
    }

    const startDate = this.parseDate(startTime, 'Tournament start time');

    // Allow start times up to 24h in the past so admins can run immediate test events
    const earliestAllowed = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (startDate < earliestAllowed) {
      throw new Error('Tournament start time is too far in the past');
    }

    // Validate buy-in if provided
    if (buyIn !== null && buyIn !== undefined) {
      const parsedBuyIn = Number(buyIn);
      if (!Number.isFinite(parsedBuyIn) || parsedBuyIn < 0) {
        throw new Error('Table buy-in must be a non-negative number');
      }
    }

    // Validate tournament buy-in if provided
    if (tournamentBuyIn !== null && tournamentBuyIn !== undefined) {
      const parsedTournamentBuyIn = Number(tournamentBuyIn);
      if (!Number.isFinite(parsedTournamentBuyIn) || parsedTournamentBuyIn < 0) {
        throw new Error('Tournament entry fee must be a non-negative number');
      }
    }

    // Validate prizes structure if provided
    let prizesData = null;
    if (prizes) {
      if (typeof prizes === 'object') {
        prizesData = prizes;
      } else {
        throw new Error('Prizes must be an object');
      }
    }

    // Build specialRules JSON from specialRule1 and specialRule2
    const specialRules = {};
    if (specialRule1 && Array.isArray(specialRule1) && specialRule1.length > 0) {
      specialRules.specialRule1 = specialRule1.length === 1 ? specialRule1[0] : specialRule1;
    }
    if (specialRule2 && Array.isArray(specialRule2) && specialRule2.length > 0) {
      specialRules.specialRule2 = specialRule2.length === 1 ? specialRule2[0] : specialRule2;
    }

    return prisma.tournament.create({
      data: {
        name: name.trim(),
        mode,
        format,
        gimmickVariant,
        isRated: true, // Tournaments always have 4 human players, so always rated
        minPoints,
        maxPoints,
        nilAllowed,
        blindNilAllowed,
        buyIn: buyIn !== null && buyIn !== undefined ? Number(buyIn) : null,
        tournamentBuyIn: tournamentBuyIn !== null && tournamentBuyIn !== undefined ? Number(tournamentBuyIn) : null,
        startTime: startDate,
        eliminationType,
        prizes: prizesData,
        bannerUrl,
        specialRules: Object.keys(specialRules).length > 0 ? specialRules : null,
        leagueId: leagueId || null,
        status: 'REGISTRATION_OPEN',
      },
      include: {
        registrations: {
          include: {
            user: true,
            partner: true,
          },
        },
      },
    });
  }

  static async getTournament(tournamentId) {
    return prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: {
          include: {
            user: true,
            partner: true,
          },
          orderBy: {
            registeredAt: 'asc',
          },
        },
        matches: {
          orderBy: [
            { round: 'asc' },
            { matchNumber: 'asc' },
          ],
        },
      },
    });
  }

  static async getTournaments(filters = {}) {
    const { status, limit = 50, leagueId } = filters;
    
    const where = {};
    if (status) {
      where.status = status;
    }
    if (leagueId !== undefined) {
      where.leagueId = leagueId;
    }

    return prisma.tournament.findMany({
      where,
      include: {
        registrations: {
          include: {
            user: true,
            partner: true,
          },
        },
        _count: {
          select: {
            registrations: true,
            matches: true,
          },
        },
      },
      orderBy: {
        startTime: 'desc',
      },
      take: limit,
    });
  }

  static async updateTournament(tournamentId, data) {
    if (!tournamentId) {
      throw new Error('Tournament ID is required');
    }

    const updateData = {};
    
    if (data.discordMessageId !== undefined) {
      updateData.discordMessageId = data.discordMessageId;
    }
    
    if (data.discordChannelId !== undefined) {
      updateData.discordChannelId = data.discordChannelId;
    }
    
    if (data.status !== undefined) {
      updateData.status = data.status;
    }

    return prisma.tournament.update({
      where: { id: tournamentId },
      data: updateData,
      include: {
        registrations: {
          include: {
            user: true,
            partner: true,
          },
        },
      },
    });
  }

  static async getRegistrationStats(tournamentId) {
    const registrations = await prisma.tournamentRegistration.findMany({
      where: { tournamentId },
      include: {
        user: true,
        partner: true,
      },
    });

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { mode: true }
    });

    const unpartneredPlayers = registrations.filter((reg) => !reg.partnerId && !reg.isSub).length;
    const subCount = registrations.filter((reg) => reg.isSub).length;

    let completeTeams = 0;
    if (tournament?.mode === 'SOLO') {
      completeTeams = registrations.filter((reg) => !reg.isSub).length;
    } else {
      // Each partnership has 2 registration rows — count unique pairs once
      const seen = new Set();
      for (const reg of registrations) {
        if (!reg.partnerId || !reg.isComplete) continue;
        const key = [reg.userId, reg.partnerId].sort().join(':');
        if (seen.has(key)) continue;
        seen.add(key);
        completeTeams++;
      }
    }

    return {
      totalRegistrations: registrations.length,
      completeTeams,
      unpartneredPlayers,
      subCount,
    };
  }

  static async cancelTournament(tournamentId) {
    // Update tournament status to CANCELLED
    return await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'CANCELLED' },
    });
  }

  static async deleteTournament(tournamentId) {
    // Delete all registrations first (cascade)
    await prisma.tournamentRegistration.deleteMany({
      where: { tournamentId },
    });

    // Delete tournament matches if any
    await prisma.tournamentMatch.deleteMany({
      where: { tournamentId },
    });

    // Delete the tournament
    return await prisma.tournament.delete({
      where: { id: tournamentId },
    });
  }

  static async startTournament(tournamentId) {
    const { TournamentBracketService } = await import('./TournamentBracketService.js');
    const { DiscordTournamentService } = await import('./DiscordTournamentService.js');
    
    // Get tournament with matches and registrations
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        matches: {
          where: { round: 1 }, // First round matches
          orderBy: { matchNumber: 'asc' },
        },
        registrations: {
          include: {
            user: true,
            partner: true,
          },
        },
      },
    });

    if (!tournament) {
      throw new Error('Tournament not found');
    }

    if (tournament.status !== 'REGISTRATION_CLOSED') {
      throw new Error('Tournament bracket must be finalized before starting');
    }

    // Post "Good Luck" embed and ready embeds (NO game creation yet)
    const { client } = await import('../discord/bot.js');
    if (client && client.isReady()) {
      // Post initial good luck embed
      await DiscordTournamentService.postTournamentGoodLuckEmbed(client, tournament);
      
      // Post ready embeds for each game with ready buttons
      await DiscordTournamentService.postTournamentReadyEmbeds(client, tournament);
    }

    // Update tournament status
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'IN_PROGRESS' },
    });

    return { success: true, message: 'Tournament started - waiting for players to ready up' };
  }

  /** Register a user into an open tournament (admin self-register / bots). */
  static async registerUser(tournamentId, userId, { partnerId = null } = {}) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { registrations: true }
    });
    if (!tournament) throw new Error('Tournament not found');
    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw new Error('Registration is closed');
    }
    const existing = tournament.registrations.find((r) => r.userId === userId);
    if (existing) return existing;

    return prisma.tournamentRegistration.create({
      data: {
        tournamentId,
        userId,
        partnerId,
        isComplete: Boolean(partnerId),
        isSub: false
      },
      include: { user: true, partner: true }
    });
  }

  /** Add N bot registrations for test / fill. */
  static async addBots(tournamentId, count) {
    const n = Math.max(0, Math.min(64, Number(count) || 0));
    if (n === 0) return { added: 0, bots: [] };

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { registrations: true }
    });
    if (!tournament) throw new Error('Tournament not found');
    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw new Error('Can only add bots while registration is open');
    }

    const { BotUserService } = await import('./BotUserService.js');
    const bots = [];
    for (let i = 0; i < n; i++) {
      const botDiscordId = `bot_tour_${tournamentId.slice(-6)}_${Date.now()}_${i}`;
      const botUser = await BotUserService.createBotUser(botDiscordId, tournamentId);
      // Prefer a readable tournament bot name
      if (!botUser.username?.startsWith('TourBot_')) {
        try {
          await prisma.user.update({
            where: { id: botUser.id },
            data: { username: `TourBot_${String(i + 1).padStart(2, '0')}` }
          });
        } catch {}
      }
      const reg = await this.registerUser(tournamentId, botUser.id);
      bots.push({ userId: botUser.id, username: `TourBot_${String(i + 1).padStart(2, '0')}`, registrationId: reg.id });
    }
    return { added: bots.length, bots };
  }

  static buildTeamMap(registrations) {
    const teamIdToPlayerIds = new Map();
    const processed = new Set();

    for (const reg of registrations) {
      if (processed.has(reg.id)) continue;
      if (reg.partnerId && reg.isComplete) {
        const players = [reg.userId, reg.partnerId];
        teamIdToPlayerIds.set(`team_${reg.userId}_${reg.partnerId}`, players);
        teamIdToPlayerIds.set(`team_${reg.partnerId}_${reg.userId}`, players);
        processed.add(reg.id);
        const partner = registrations.find(
          (r) => r.userId === reg.partnerId && r.partnerId === reg.userId
        );
        if (partner) processed.add(partner.id);
      } else if (!reg.partnerId && !reg.isSub) {
        teamIdToPlayerIds.set(`team_${reg.userId}`, [reg.userId]);
        processed.add(reg.id);
      }
    }
    return teamIdToPlayerIds;
  }

  /** Create Spades tables for human matches; instantly resolve all-bot matches. */
  static async openPlayableTables(tournamentId) {
    const { BotUserService } = await import('./BotUserService.js');
    const { TournamentBracketService } = await import('./TournamentBracketService.js');

    const results = [];
    // Loop: resolving all-bot matches unlocks later rounds that may also be all-bot
    for (let guard = 0; guard < 64; guard++) {
      const tournament = await this.getTournament(tournamentId);
      if (!tournament) throw new Error('Tournament not found');

      const teamMap = this.buildTeamMap(tournament.registrations || []);
      const playable = (tournament.matches || []).filter(
        (m) =>
          m.team1Id &&
          m.team2Id &&
          !m.gameId &&
          m.status === 'PENDING'
      );
      if (!playable.length) break;

      let autoResolvedThisPass = 0;

      for (const match of playable) {
        try {
          const t1 = teamMap.get(match.team1Id) || [];
          const t2 = teamMap.get(match.team2Id) || [];
          const playerIds = [...t1, ...t2];
          if (playerIds.length < 4) {
            console.warn(
              `[TOURNAMENT] Match ${match.id} has ${playerIds.length}/4 players — skipping`
            );
            continue;
          }

          const users = await prisma.user.findMany({
            where: { id: { in: playerIds } }
          });
          const allBots =
            users.length === playerIds.length &&
            users.every((u) => BotUserService.isBotUser(u));

          if (allBots) {
            const winnerId = Math.random() < 0.5 ? match.team1Id : match.team2Id;
            await TournamentBracketService.recordMatchResult(
              tournamentId,
              match.id,
              winnerId
            );
            results.push({
              matchId: match.id,
              round: match.round,
              autoResolved: true,
              winnerId
            });
            autoResolvedThisPass++;
            console.log(
              `[TOURNAMENT] Auto-resolved all-bot match ${match.id} → ${winnerId}`
            );
            continue;
          }

          // At least one human — open a real table for Join / Watch.
          // Do not deal until a human joins (avoids bots finishing without them).
          const game = await this.createMatchTable(tournament, match, teamMap);
          await this.maybeAutostartTournamentGame(game.id);
          results.push({
            matchId: match.id,
            gameId: game.id,
            round: match.round,
            autoResolved: false
          });
          await this.notifyTournamentTableReady(tournament, match, game.id, playerIds);
        } catch (e) {
          console.error(`[TOURNAMENT] Failed to open match ${match.id}:`, e.message || e);
        }
      }

      // Only re-loop when auto-resolves may have unlocked new playable matches
      if (autoResolvedThisPass === 0) break;
    }

    return results;
  }

  /** Tell league clients a human match table is ready so players can auto-open it. */
  static async notifyTournamentTableReady(tournament, match, gameId, playerIds) {
    if (!tournament?.leagueId || !gameId) return;
    try {
      const { io } = await import('../config/server.js');
      if (!io) return;
      const payload = {
        leagueId: tournament.leagueId,
        tournamentId: tournament.id,
        matchId: match.id,
        gameId,
        playerIds: (playerIds || []).filter(Boolean),
        round: match.round,
        matchNumber: match.matchNumber
      };
      io.to(`league_${tournament.leagueId}`).emit('tournament_table_ready', payload);
      console.log(
        `[TOURNAMENT] Emitted tournament_table_ready ${gameId} → ${payload.playerIds.length} players`
      );
    } catch (e) {
      console.warn('[TOURNAMENT] notifyTournamentTableReady failed:', e.message || e);
    }
  }

  /** @deprecated use openPlayableTables */
  static async createRound1Tables(tournamentId) {
    return this.openPlayableTables(tournamentId);
  }

  /**
   * Partner Spades seating must be across the table so ScoringService / bots
   * (seatIndex % 2) match tournament teams. Adjacent 0+1 / 2+3 seating caused
   * humans to "win" on the scoreboard while the bracket advanced the other team.
   */
  static partnerSeatAssignments(team1, team2) {
    return [
      { userId: team1[0], seatIndex: 0, teamIndex: 0 },
      { userId: team2[0], seatIndex: 1, teamIndex: 1 },
      { userId: team1[1], seatIndex: 2, teamIndex: 0 },
      { userId: team2[1], seatIndex: 3, teamIndex: 1 }
    ];
  }

  /** Upsert all four seats; throw if the table is not fully seated. */
  static async seatTournamentPlayers(gameId, seats, userById) {
    const { BotUserService } = await import('./BotUserService.js');

    for (const s of seats) {
      const user = userById.get(s.userId);
      if (!user) {
        throw new Error(`Missing user ${s.userId} for tournament seat ${s.seatIndex}`);
      }
      const isHuman = !BotUserService.isBotUser(user);
      const existingSeat = await prisma.gamePlayer.findFirst({
        where: { gameId, seatIndex: s.seatIndex, isSpectator: false }
      });
      if (existingSeat) {
        await prisma.gamePlayer.update({
          where: { id: existingSeat.id },
          data: {
            userId: s.userId,
            teamIndex: s.teamIndex,
            isHuman,
            leftAt: null,
            isSpectator: false
          }
        });
      } else {
        await prisma.gamePlayer.create({
          data: {
            gameId,
            userId: s.userId,
            seatIndex: s.seatIndex,
            teamIndex: s.teamIndex,
            isHuman,
            joinedAt: new Date()
          }
        });
      }
    }

    const seated = await prisma.gamePlayer.findMany({
      where: {
        gameId,
        seatIndex: { not: null },
        isSpectator: false,
        leftAt: null
      }
    });
    if (seated.length !== seats.length) {
      throw new Error(
        `Tournament table ${gameId} has ${seated.length}/${seats.length} seated after create`
      );
    }
  }

  /**
   * All-bot tables deal immediately. Mixed tables stay WAITING until a human Joins
   * (see gameJoinHandler → autostartTournamentGame).
   */
  static async maybeAutostartTournamentGame(gameId) {
    const { BotUserService } = await import('./BotUserService.js');
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: { players: { include: { user: true } } }
    });
    if (!game || game.status !== 'WAITING') return game;

    const seated = (game.players || []).filter(
      (p) => !p.leftAt && p.seatIndex != null && !p.isSpectator
    );
    const hasHuman = seated.some(
      (p) => p.isHuman === true || !BotUserService.isBotUser(p.user)
    );
    if (hasHuman) {
      console.log(`[TOURNAMENT] ${gameId} waiting for human Join before deal`);
      return game;
    }
    return this.autostartTournamentGame(gameId);
  }

  /**
   * Deal and kick off bot bidding for a tournament table that is already fully seated.
   * Humans Join from the bracket to take their seats in the live game.
   */
  static async autostartTournamentGame(gameId) {
    const { GameService } = await import('./GameService.js');
    const { redisGameState } = await import('./RedisGameStateService.js');

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: { players: { include: { user: true } } }
    });
    if (!game || game.status !== 'WAITING') return game;

    const seated = (game.players || []).filter((p) => !p.leftAt);
    if (seated.length < 4) {
      console.warn(`[TOURNAMENT] Not starting ${gameId} — only ${seated.length}/4 seated`);
      return game;
    }

    await GameService.startGame(gameId);
    await GameService.dealInitialHands(gameId);

    try {
      const full = await GameService.getFullGameStateFromDatabase(gameId);
      if (full) await redisGameState.setGameState(gameId, full);

      try {
        const { io } = await import('../config/server.js');
        if (io && full) {
          const { emitPersonalizedGameEvent } = await import('./SocketGameBroadcastService.js');
          emitPersonalizedGameEvent(io, gameId, 'game_started', full);
          emitPersonalizedGameEvent(io, gameId, 'game_update', full);
        }
      } catch (emitErr) {
        console.warn('[TOURNAMENT] Could not emit game_started:', emitErr.message);
      }

      // Kick bot bidding if current bidder is a bot
      const currentId = full?.currentPlayer;
      const current = (full?.players || game.players || []).find(
        (p) => p && (p.userId === currentId || p.id === currentId)
      );
      const isBot = current && current.isHuman === false;
      if (isBot || (current && current.user && String(current.user.discordId || '').startsWith('bot_'))) {
        try {
          const { BiddingHandler } = await import('../modules/socket-handlers/bidding/biddingHandler.js');
          const { io } = await import('../config/server.js');
          const biddingHandler = new BiddingHandler(io, null);
          // Fire and forget — bots chain their own next actions
          biddingHandler.triggerBotBidIfNeeded(gameId).catch((e) =>
            console.error('[TOURNAMENT] Bot bid kickoff failed:', e.message || e)
          );
        } catch (bidErr) {
          console.error('[TOURNAMENT] Bot bidding import failed:', bidErr.message || bidErr);
        }
      }
    } catch (e) {
      console.error('[TOURNAMENT] autostartTournamentGame error:', e);
    }

    return prisma.game.findUnique({ where: { id: gameId } });
  }

  static async createMatchTable(tournament, match, teamMap) {
    const { GameService } = await import('./GameService.js');
    const { redisGameState } = await import('./RedisGameStateService.js');

    const team1 = teamMap.get(match.team1Id) || [];
    const team2 = match.team2Id ? teamMap.get(match.team2Id) || [] : [];
    if (tournament.mode === 'PARTNERS' && (team1.length < 2 || team2.length < 2)) {
      throw new Error(`Match ${match.matchNumber} is missing partners for a table`);
    }
    if (team1.length === 0 || team2.length === 0) {
      throw new Error(`Match ${match.matchNumber} is missing teams`);
    }

    const seats =
      tournament.mode === 'PARTNERS'
        ? this.partnerSeatAssignments(team1, team2)
        : [
            { userId: team1[0], seatIndex: 0, teamIndex: 0 },
            { userId: team2[0], seatIndex: 1, teamIndex: 1 }
          ];

    if (tournament.mode !== 'PARTNERS' && seats.length < 4) {
      // Solo brackets are 1v1 teams — need four soloists per Spades table (not supported yet)
      throw new Error('Solo tournament tables need four players; use PARTNERS mode for test play');
    }

    const gameId = `tournament_${tournament.id}_match_${match.id}`;
    const users = await prisma.user.findMany({
      where: { id: { in: seats.map((s) => s.userId) } }
    });
    const userById = new Map(users.map((u) => [u.id, u]));
    if (users.length !== seats.length) {
      const missing = seats.map((s) => s.userId).filter((id) => !userById.has(id));
      throw new Error(`Tournament match players missing from DB: ${missing.join(', ')}`);
    }

    const existing = await prisma.game.findUnique({ where: { id: gameId } });
    if (existing) {
      if (existing.status === 'WAITING') {
        await this.seatTournamentPlayers(gameId, seats, userById);
        try {
          const full = await GameService.getFullGameStateFromDatabase(gameId);
          if (full) await redisGameState.setGameState(gameId, full);
        } catch (e) {
          console.error('[TOURNAMENT] Redis cache after re-seat:', e);
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
      leagueId: tournament.leagueId || null,
      isLeague: false,
      isRated: false, // test / bot-filled tournaments should not skew ratings
      maxPoints: tournament.maxPoints || 500,
      minPoints: tournament.minPoints || -100,
      buyIn: tournament.buyIn || 0,
      nilAllowed: tournament.nilAllowed !== false,
      blindNilAllowed: tournament.blindNilAllowed || false,
      specialRules: tournament.specialRules || {}
    });

    await this.seatTournamentPlayers(game.id, seats, userById);

    await prisma.tournamentMatch.update({
      where: { id: match.id },
      data: { gameId: game.id, status: 'IN_PROGRESS' }
    });

    try {
      const full = await GameService.getFullGameStateFromDatabase(game.id);
      if (full) await redisGameState.setGameState(game.id, full);
    } catch (e) {
      console.error('[TOURNAMENT] Redis cache after match table:', e);
    }

    return game;
  }

  /**
   * Test / admin early start: optionally add bots, register admin, finalize bracket,
   * open round-1 tables, mark tournament IN_PROGRESS.
   */
  static async startEarly(tournamentId, adminUserId, { botCount = 0, registerAdmin = true } = {}) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { registrations: true, matches: true }
    });
    if (!tournament) throw new Error('Tournament not found');
    if (tournament.status === 'COMPLETED' || tournament.status === 'CANCELLED') {
      throw new Error('Tournament cannot be started');
    }

    if (registerAdmin && adminUserId && tournament.status === 'REGISTRATION_OPEN') {
      try {
        await this.registerUser(tournamentId, adminUserId);
      } catch (e) {
        if (!String(e.message || '').includes('closed')) throw e;
      }
    }

    if (botCount > 0 && tournament.status === 'REGISTRATION_OPEN') {
      await this.addBots(tournamentId, botCount);
    }

    // Refresh — may still be OPEN or already CLOSED
    let fresh = await this.getTournament(tournamentId);
    if (fresh.status === 'REGISTRATION_OPEN') {
      const { TournamentBracketService } = await import('./TournamentBracketService.js');
      await TournamentBracketService.generateBracket(tournamentId);
      fresh = await this.getTournament(tournamentId);
    }

    if (!fresh.matches?.length) {
      throw new Error('Bracket has no matches — need at least 2 teams (4 players in PARTNERS)');
    }

    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'IN_PROGRESS' }
    });

    let tables = [];
    if (fresh.mode === 'PARTNERS') {
      tables = await this.openPlayableTables(tournamentId);
    }

    // Soft Discord notify (ignore failures for local/test)
    try {
      const { DiscordTournamentService } = await import('./DiscordTournamentService.js');
      const { client } = await import('../discord/bot.js');
      if (client?.isReady?.() && !fresh.leagueId) {
        const t = await this.getTournament(tournamentId);
        await DiscordTournamentService.postTournamentGoodLuckEmbed(client, t);
      }
    } catch (e) {
      console.warn('[TOURNAMENT] Discord notify skipped:', e.message);
    }

    return {
      success: true,
      tables,
      tournament: await this.getTournament(tournamentId),
      message: `Tournament started early with ${tables.length} round-1 table(s)`
    };
  }
}

