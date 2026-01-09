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

    // Validate start time is in the future
    if (startDate <= new Date()) {
      throw new Error('Tournament start time must be in the future');
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
    const { status, limit = 50 } = filters;
    
    const where = {};
    if (status) {
      where.status = status;
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

    // Count complete teams (both partners registered)
    const completeTeams = registrations.filter(reg => reg.partnerId && reg.isComplete).length;
    
    // Count players without partners
    const unpartneredPlayers = registrations.filter(reg => !reg.partnerId).length;

    return {
      totalRegistrations: registrations.length,
      completeTeams,
      unpartneredPlayers,
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
    const { GameService } = await import('./GameService.js');
    
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

    // Create game tables for first round matches
    const createdGames = [];
    const teamIdToPlayerIds = new Map(); // Map team IDs to player user IDs
    
    // Build team ID to player IDs map from registrations
    for (const reg of tournament.registrations) {
      if (reg.partnerId && reg.isComplete) {
        const teamId = `team_${reg.userId}_${reg.partnerId}`;
        if (!teamIdToPlayerIds.has(teamId)) {
          teamIdToPlayerIds.set(teamId, [reg.userId, reg.partnerId]);
        }
      } else if (!reg.partnerId && !reg.isSub) {
        // Solo team (shouldn't happen in PARTNERS mode, but handle it)
        const teamId = `team_${reg.userId}`;
        teamIdToPlayerIds.set(teamId, [reg.userId]);
      }
    }

    for (const match of tournament.matches) {
      if (match.status === 'COMPLETED' || !match.team1Id) {
        // Skip byes and completed matches
        continue;
      }

      const team1Players = teamIdToPlayerIds.get(match.team1Id) || [];
      const team2Players = teamIdToPlayerIds.get(match.team2Id) || [];

      if (team1Players.length === 0 || (match.team2Id && team2Players.length === 0)) {
        console.warn(`[TOURNAMENT] Skipping match ${match.id} - missing team players`);
        continue;
      }

      // Create game with tournament settings
      const gameId = `tournament_${tournamentId}_match_${match.id}`;
      const gameData = {
        id: gameId,
        createdById: team1Players[0], // Use first player as creator
        mode: tournament.mode,
        format: tournament.format,
        gimmickVariant: tournament.gimmickVariant,
        isLeague: true,
        isRated: true, // Tournament games are always rated
        maxPoints: tournament.maxPoints || 500,
        minPoints: tournament.minPoints || -100,
        buyIn: tournament.buyIn || 0,
        nilAllowed: tournament.nilAllowed !== false,
        blindNilAllowed: tournament.blindNilAllowed || false,
        specialRules: tournament.specialRules || {},
        status: 'WAITING',
      };

      const game = await GameService.createGame(gameData);

      // Add players to game
      const allPlayers = [...team1Players, ...(match.team2Id ? team2Players : [])];
      for (let i = 0; i < allPlayers.length && i < 4; i++) {
        const userId = allPlayers[i];
        const seatIndex = i;
        const teamIndex = tournament.mode === 'PARTNERS' ? (i < 2 ? 0 : 1) : i;

        await prisma.gamePlayer.create({
          data: {
            gameId: game.id,
            userId,
            seatIndex,
            teamIndex,
            isHuman: true,
            joinedAt: new Date(),
          },
        });
      }

      // Update match with game ID
      await prisma.tournamentMatch.update({
        where: { id: match.id },
        data: { gameId: game.id, status: 'IN_PROGRESS' },
      });

      createdGames.push({ match, game });
    }

    // Post Discord embed with match details
    const { client } = await import('../discord/bot.js');
    if (client && client.isReady()) {
      await DiscordTournamentService.postTournamentStartEmbed(client, tournament, createdGames);
    }

    // Update tournament status
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'IN_PROGRESS' },
    });

    return { gamesCreated: createdGames.length, matches: createdGames };
  }
}

