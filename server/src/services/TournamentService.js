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
}

