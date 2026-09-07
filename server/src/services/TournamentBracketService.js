import { prisma } from '../config/database.js';

export class TournamentBracketService {
  /**
   * Form teams from registrations and generate bracket
   * Called when registration closes (manually or at start time)
   */
  static async generateBracket(tournamentId) {
    try {
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
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

      if (tournament.status !== 'REGISTRATION_OPEN' && tournament.status !== 'REGISTRATION_CLOSED') {
        throw new Error('Tournament registration must be open or closed to generate bracket');
      }

      // Delete existing matches if any (allows regenerating bracket)
      await prisma.tournamentMatch.deleteMany({
        where: { tournamentId },
      });

      const registrations = tournament.registrations;
      
      // Step 1: Form teams
      const teams = await this.formTeams(tournamentId, registrations, tournament.mode);
      
      if (teams.length < 2) {
        throw new Error('Need at least 2 teams to start a tournament');
      }

      // Step 2: Generate bracket based on elimination type
      if (tournament.eliminationType === 'DOUBLE') {
        await this.generateDoubleEliminationBracket(tournamentId, teams);
      } else {
        await this.generateSingleEliminationBracket(tournamentId, teams);
      }

      // Step 3: Close registration (bracket is finalized but tournament not started yet)
      const updatedTournament = await prisma.tournament.update({
        where: { id: tournamentId },
        data: { status: 'REGISTRATION_CLOSED' },
        include: {
          registrations: {
            include: {
              user: true,
              partner: true,
            },
          },
        },
      });

      // Step 4: Discord embeds only for global Discord tournaments
      if (!updatedTournament.leagueId) {
        try {
          const { DiscordTournamentService } = await import('./DiscordTournamentService.js');
          const { client } = await import('../discord/bot.js');
          if (client && client.isReady()) {
            await DiscordTournamentService.updateTournamentEmbed(client, updatedTournament);
            await DiscordTournamentService.postBracketFinalizedEmbed(client, updatedTournament, teams);
          }
        } catch (discordError) {
          console.error('[TOURNAMENT BRACKET] Error updating Discord embed:', discordError);
        }
      }

      return { teams, bracketGenerated: true };
    } catch (error) {
      console.error('[TOURNAMENT BRACKET] Error generating bracket:', error);
      throw error;
    }
  }

  /**
   * Form teams from registrations
   * For PARTNERS mode: pair up players
   * For SOLO mode: each player is their own team
   */
  static async formTeams(tournamentId, registrations, mode) {
    const teams = [];

    if (mode === 'SOLO') {
      // Each player is their own team
      for (const reg of registrations) {
        teams.push({
          id: `team_${reg.userId}`,
          playerIds: [reg.userId],
          registrationIds: [reg.id],
        });
      }
    } else {
      // PARTNERS mode - need to pair players
      const processedIds = new Set();
      
      // First, pair up complete teams (both partners registered)
      for (const reg of registrations) {
        if (processedIds.has(reg.id)) continue;
        
        if (reg.partnerId && reg.isComplete) {
          const partner = registrations.find(
            r => r.userId === reg.partnerId && r.partnerId === reg.userId && !processedIds.has(r.id)
          );
          
          if (partner) {
            teams.push({
              id: `team_${reg.userId}_${partner.userId}`,
              playerIds: [reg.userId, partner.userId],
              registrationIds: [reg.id, partner.id],
            });
            processedIds.add(reg.id);
            processedIds.add(partner.id);
          }
        }
      }

      // Then, randomly pair up remaining unpartnered players
      const unpartnered = registrations.filter(r => !processedIds.has(r.id) && !r.partnerId);
      
      // Shuffle for random pairing
      const shuffled = [...unpartnered].sort(() => Math.random() - 0.5);
      
      // If odd number, mark the last one as a sub
      let subRegistrationId = null;
      if (shuffled.length % 2 === 1) {
        const subPlayer = shuffled.pop();
        subRegistrationId = subPlayer.id;
        // Mark as sub in database
        await prisma.tournamentRegistration.update({
          where: { id: subPlayer.id },
          data: { isSub: true },
        });
      }
      
      // Pair them up and persist partnerships so team maps resolve later
      for (let i = 0; i < shuffled.length; i += 2) {
        if (i + 1 < shuffled.length) {
          const player1 = shuffled[i];
          const player2 = shuffled[i + 1];

          await prisma.tournamentRegistration.update({
            where: { id: player1.id },
            data: { partnerId: player2.userId, isComplete: true, isSub: false }
          });
          await prisma.tournamentRegistration.update({
            where: { id: player2.id },
            data: { partnerId: player1.userId, isComplete: true, isSub: false }
          });
          
          teams.push({
            id: `team_${player1.userId}_${player2.userId}`,
            playerIds: [player1.userId, player2.userId],
            registrationIds: [player1.id, player2.id],
          });
          processedIds.add(player1.id);
          processedIds.add(player2.id);
        }
      }
    }

    return teams;
  }

  /**
   * Generate single elimination bracket
   * If N is a power of 2: full R1 with N/2 matches.
   * Otherwise play-in to the next lower power of 2:
   *   Example: 10 teams → 6 byes + 2 R1 matches → 8 in R2
   *   Example: 5 teams → 3 byes + 1 R1 match → 4 in R2 (semis)
   * Bye teams are seeded into R2 slots that are not fed by R1 winners
   * (same mapping advanceBracket uses: R1 match M → R2 match ceil(M/2), slot M odd=team1 / even=team2).
   */
  static async generateSingleEliminationBracket(tournamentId, teams) {
    const numTeams = teams.length;

    if (numTeams === 2) {
      const seededTeams = [...teams].sort(() => Math.random() - 0.5);
      await prisma.tournamentMatch.create({
        data: {
          tournamentId,
          round: 1,
          matchNumber: 1,
          team1Id: seededTeams[0].id,
          team2Id: seededTeams[1].id,
          status: 'PENDING',
        },
      });
      return;
    }

    const seededTeams = [...teams].sort(() => Math.random() - 0.5);
    const isPowerOfTwo = (numTeams & (numTeams - 1)) === 0;
    const matches = [];

    if (isPowerOfTwo) {
      // Full bracket from round 1
      let matchNumber = 1;
      for (let i = 0; i < seededTeams.length; i += 2) {
        matches.push({
          tournamentId,
          round: 1,
          matchNumber: matchNumber++,
          team1Id: seededTeams[i].id,
          team2Id: seededTeams[i + 1].id,
          status: 'PENDING',
        });
      }

      let teamsInRound = numTeams / 2;
      let round = 2;
      while (teamsInRound >= 2) {
        const matchCount = teamsInRound / 2;
        for (let m = 1; m <= matchCount; m++) {
          matches.push({
            tournamentId,
            round,
            matchNumber: m,
            team1Id: null,
            team2Id: null,
            status: 'PENDING',
          });
        }
        teamsInRound /= 2;
        round++;
      }

      await prisma.tournamentMatch.createMany({ data: matches });
      return matches;
    }

    // Play-in to largest power of 2 strictly less than N... actually <= N but N isn't power of 2
    // so largest power of 2 <= N is also < N
    const nextRoundSize = Math.pow(2, Math.floor(Math.log2(numTeams)));
    const numByes = 2 * nextRoundSize - numTeams;
    const numPlaying = numTeams - numByes;
    const r1MatchCount = numPlaying / 2;
    const r2MatchCount = nextRoundSize / 2;

    if (numPlaying <= 0 || numPlaying % 2 !== 0 || numByes < 0) {
      throw new Error(`Invalid bracket math for ${numTeams} teams (byes=${numByes}, playing=${numPlaying})`);
    }

    const teamsWithByes = seededTeams.slice(0, numByes);
    const teamsPlaying = seededTeams.slice(numByes);

    for (let i = 0; i < teamsPlaying.length; i += 2) {
      const team1 = teamsPlaying[i];
      const team2 = teamsPlaying[i + 1] || null;
      matches.push({
        tournamentId,
        round: 1,
        matchNumber: Math.floor(i / 2) + 1,
        team1Id: team1.id,
        team2Id: team2?.id || null,
        status: team2 ? 'PENDING' : 'COMPLETED',
        winnerId: team2 ? null : team1.id,
      });
    }

    const playInSlots = new Set();
    for (let m = 1; m <= r1MatchCount; m++) {
      const nextMatchNumber = Math.ceil(m / 2);
      const slot = m % 2 === 1 ? 'team1Id' : 'team2Id';
      playInSlots.add(`${nextMatchNumber}:${slot}`);
    }

    const r2Slots = {};
    for (let m = 1; m <= r2MatchCount; m++) {
      r2Slots[m] = { team1Id: null, team2Id: null };
    }
    let byeIdx = 0;
    for (let m = 1; m <= r2MatchCount; m++) {
      for (const slot of ['team1Id', 'team2Id']) {
        if (playInSlots.has(`${m}:${slot}`)) continue;
        if (byeIdx < teamsWithByes.length) {
          r2Slots[m][slot] = teamsWithByes[byeIdx].id;
          byeIdx++;
        }
      }
    }

    for (let m = 1; m <= r2MatchCount; m++) {
      matches.push({
        tournamentId,
        round: 2,
        matchNumber: m,
        team1Id: r2Slots[m].team1Id,
        team2Id: r2Slots[m].team2Id,
        status: 'PENDING',
      });
    }

    let teamsInRound = nextRoundSize / 2;
    let round = 3;
    while (teamsInRound >= 2) {
      const matchCount = teamsInRound / 2;
      for (let m = 1; m <= matchCount; m++) {
        matches.push({
          tournamentId,
          round,
          matchNumber: m,
          team1Id: null,
          team2Id: null,
          status: 'PENDING',
        });
      }
      teamsInRound /= 2;
      round++;
    }

    for (const match of matches) {
      if (match.round === 1 && match.status === 'COMPLETED' && match.winnerId) {
        const nextMatchNumber = Math.ceil(match.matchNumber / 2);
        const isFirstSlot = match.matchNumber % 2 === 1;
        const r2 = matches.find((m) => m.round === 2 && m.matchNumber === nextMatchNumber);
        if (r2) {
          if (isFirstSlot) r2.team1Id = match.winnerId;
          else r2.team2Id = match.winnerId;
        }
      }
    }

    if (byeIdx !== teamsWithByes.length) {
      console.warn(
        `[TOURNAMENT BRACKET] Bye placement mismatch: placed ${byeIdx}/${teamsWithByes.length} for ${numTeams} teams`
      );
    }

    await prisma.tournamentMatch.createMany({ data: matches });
    return matches;
  }

  /**
   * Losers-bracket round metadata for a power-of-2 double-elim size.
   * Round codes: WB = 100,200,…; LB = 101,102,…; GF = 1000; GF reset = 1001.
   */
  static buildDoubleElimLbMeta(bracketSize) {
    if (bracketSize < 4) return [];
    const wbRounds = Math.log2(bracketSize);
    const meta = [];
    let lbRound = 101;
    meta.push({ round: lbRound++, matchCount: bracketSize / 4, kind: 'w1' });
    for (let wr = 2; wr <= wbRounds; wr++) {
      const dropCount = bracketSize / Math.pow(2, wr);
      meta.push({ round: lbRound++, matchCount: dropCount, kind: 'drop', wbSource: wr });
      if (wr < wbRounds) {
        meta.push({ round: lbRound++, matchCount: dropCount / 2, kind: 'purge' });
      }
    }
    return meta;
  }

  static wbRoundsForSize(bracketSize) {
    return Math.log2(bracketSize);
  }

  static async inferDoubleElimBracketSize(tournamentId) {
    const wbR1Count = await prisma.tournamentMatch.count({
      where: { tournamentId, round: 100 }
    });
    if (wbR1Count > 0) return wbR1Count * 2;

    const firstWb = await prisma.tournamentMatch.findFirst({
      where: {
        tournamentId,
        round: { gte: 100, lt: 1000 }
      },
      orderBy: { round: 'asc' },
      select: { round: true }
    });
    if (!firstWb || firstWb.round % 100 !== 0) return 0;

    const count = await prisma.tournamentMatch.count({
      where: { tournamentId, round: firstWb.round }
    });
    const wr = firstWb.round / 100;
    return count * Math.pow(2, wr);
  }

  /**
   * Generate double elimination bracket (winners + losers + grand final).
   * Pads to next power of 2 with byes. GF reset (1001) is created only if LB wins GF1.
   */
  static async generateDoubleEliminationBracket(tournamentId, teams) {
    const numTeams = teams.length;
    if (numTeams < 2) {
      throw new Error('Need at least 2 teams for double elimination');
    }
    // Byes with padded brackets leave empty losers-bracket slots; keep DE reliable for testing.
    if ((numTeams & (numTeams - 1)) !== 0) {
      throw new Error(
        `Double elimination needs a power of 2 teams (2, 4, 8, 16…). Got ${numTeams}. Add bots or players to reach the next size.`
      );
    }
    const bracketSize = numTeams;
    const seededTeams = [...teams].sort(() => Math.random() - 0.5);
    const padded = [...seededTeams];

    const matches = [];
    const wbRounds = this.wbRoundsForSize(bracketSize);

    // ——— Winners bracket ———
    let matchNumber = 1;
    for (let i = 0; i < bracketSize; i += 2) {
      const team1 = padded[i];
      const team2 = padded[i + 1];
      if (!team1 && !team2) continue;
      const t1 = team1?.id || null;
      const t2 = team2?.id || null;
      const isBye = t1 && !t2;
      matches.push({
        tournamentId,
        round: 100,
        matchNumber: matchNumber++,
        team1Id: t1,
        team2Id: t2,
        status: isBye ? 'COMPLETED' : 'PENDING',
        winnerId: isBye ? t1 : null
      });
    }

    let teamsInRound = bracketSize / 2;
    for (let wr = 2; wr <= wbRounds; wr++) {
      const matchCount = teamsInRound / 2;
      for (let m = 1; m <= matchCount; m++) {
        matches.push({
          tournamentId,
          round: wr * 100,
          matchNumber: m,
          team1Id: null,
          team2Id: null,
          status: 'PENDING'
        });
      }
      teamsInRound /= 2;
    }

    // Seed bye winners into WB round 2 (same slot map as advanceBracket)
    for (const match of matches) {
      if (match.round === 100 && match.status === 'COMPLETED' && match.winnerId) {
        const nextMatchNumber = Math.ceil(match.matchNumber / 2);
        const isFirstSlot = match.matchNumber % 2 === 1;
        const next = matches.find((m) => m.round === 200 && m.matchNumber === nextMatchNumber);
        if (next) {
          if (isFirstSlot) next.team1Id = match.winnerId;
          else next.team2Id = match.winnerId;
        }
      }
    }

    // ——— Losers bracket shells ———
    const lbMeta = this.buildDoubleElimLbMeta(bracketSize);
    for (const lb of lbMeta) {
      for (let m = 1; m <= lb.matchCount; m++) {
        matches.push({
          tournamentId,
          round: lb.round,
          matchNumber: m,
          team1Id: null,
          team2Id: null,
          status: 'PENDING'
        });
      }
    }

    // ——— Grand final (team1 = WB champ, team2 = LB champ) ———
    matches.push({
      tournamentId,
      round: 1000,
      matchNumber: 1,
      team1Id: null,
      team2Id: null,
      status: 'PENDING'
    });

    // 2-team special case: no LB rounds — WB match loser goes straight to GF
    if (bracketSize === 2) {
      // Already have WB 100 M1 and GF 1000; nothing else
    }

    await prisma.tournamentMatch.createMany({ data: matches });
    return matches;
  }

  static async placeTeamInMatch(tournamentId, round, matchNumber, slot, teamId) {
    if (!teamId) return null;
    const match = await prisma.tournamentMatch.findFirst({
      where: { tournamentId, round, matchNumber }
    });
    if (!match) {
      console.warn(
        `[TOURNAMENT BRACKET] Missing match r${round} m${matchNumber} for placement`
      );
      return null;
    }
    return prisma.tournamentMatch.update({
      where: { id: match.id },
      data: { [slot]: teamId }
    });
  }

  static async completeTournament(tournamentId, winnerTeamId) {
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'COMPLETED' }
    });
    return { completed: true, winnerTeamId };
  }

  /**
   * Update match result and advance bracket
   */
  static async recordMatchResult(tournamentId, matchId, winnerTeamId) {
    try {
      const match = await prisma.tournamentMatch.findUnique({
        where: { id: matchId },
      });

      if (!match || match.tournamentId !== tournamentId) {
        throw new Error('Match not found');
      }

      if (match.status === 'COMPLETED' && match.winnerId) {
        return { match, advanceResult: { completed: false, alreadyRecorded: true } };
      }

      await prisma.tournamentMatch.update({
        where: { id: matchId },
        data: {
          winnerId: winnerTeamId,
          status: 'COMPLETED',
        },
      });

      const advanceResult = await this.advanceBracket(tournamentId, match, winnerTeamId);

      return { match, advanceResult };
    } catch (error) {
      console.error('[TOURNAMENT BRACKET] Error recording match result:', error);
      throw error;
    }
  }

  /**
   * Advance bracket after a match completes (single or double elim).
   */
  static async advanceBracket(tournamentId, completedMatch, winnerTeamId) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { eliminationType: true }
    });

    if (tournament?.eliminationType === 'DOUBLE') {
      return this.advanceDoubleElimination(tournamentId, completedMatch, winnerTeamId);
    }
    if (completedMatch.round >= 100) {
      // Legacy / mismatched rows encoded as double-elim rounds
      return this.advanceDoubleElimination(tournamentId, completedMatch, winnerTeamId);
    }

    return this.advanceSingleElimination(tournamentId, completedMatch, winnerTeamId);
  }

  static async advanceSingleElimination(tournamentId, completedMatch, winnerTeamId) {
    const nextRound = completedMatch.round + 1;
    const nextMatchNumber = Math.ceil(completedMatch.matchNumber / 2);
    const nextMatch = await prisma.tournamentMatch.findFirst({
      where: { tournamentId, round: nextRound, matchNumber: nextMatchNumber }
    });

    let updatedNextMatch = null;
    if (nextMatch) {
      const isFirstSlot = completedMatch.matchNumber % 2 === 1;
      updatedNextMatch = await prisma.tournamentMatch.update({
        where: { id: nextMatch.id },
        data: { [isFirstSlot ? 'team1Id' : 'team2Id']: winnerTeamId }
      });
    }

    const remainingMatches = await prisma.tournamentMatch.count({
      where: { tournamentId, status: { not: 'COMPLETED' } }
    });

    if (remainingMatches === 0) {
      const finalMatch = await prisma.tournamentMatch.findFirst({
        where: { tournamentId, status: 'COMPLETED', winnerId: { not: null } },
        orderBy: { round: 'desc' }
      });
      if (finalMatch?.winnerId) {
        return {
          ...(await this.completeTournament(tournamentId, finalMatch.winnerId)),
          nextMatch: updatedNextMatch
        };
      }
    }

    return { completed: false, nextMatch: updatedNextMatch };
  }

  static async advanceDoubleElimination(tournamentId, completedMatch, winnerTeamId) {
    const round = completedMatch.round;
    const M = completedMatch.matchNumber;
    const loserTeamId =
      completedMatch.team1Id === winnerTeamId
        ? completedMatch.team2Id
        : completedMatch.team1Id;

    // ——— Grand final ———
    if (round >= 1000) {
      const wbChamp = completedMatch.team1Id;
      const lbChamp = completedMatch.team2Id;

      if (round === 1000) {
        // If WB champ wins GF1 → tournament over. If LB champ wins → reset game.
        if (winnerTeamId === wbChamp) {
          return this.completeTournament(tournamentId, winnerTeamId);
        }
        if (winnerTeamId === lbChamp) {
          const existing = await prisma.tournamentMatch.findFirst({
            where: { tournamentId, round: 1001, matchNumber: 1 }
          });
          if (existing) {
            await prisma.tournamentMatch.update({
              where: { id: existing.id },
              data: {
                team1Id: wbChamp,
                team2Id: lbChamp,
                winnerId: null,
                gameId: null,
                status: 'PENDING'
              }
            });
            return { completed: false, nextMatch: existing, resetFinal: true };
          }
          const reset = await prisma.tournamentMatch.create({
            data: {
              tournamentId,
              round: 1001,
              matchNumber: 1,
              team1Id: wbChamp,
              team2Id: lbChamp,
              status: 'PENDING'
            }
          });
          return { completed: false, nextMatch: reset, resetFinal: true };
        }
        // Ambiguous (ids missing) — treat as tournament over
        return this.completeTournament(tournamentId, winnerTeamId);
      }

      // GF2 (reset) — winner takes the tournament
      return this.completeTournament(tournamentId, winnerTeamId);
    }

    const bracketSize = await this.inferDoubleElimBracketSize(tournamentId);
    const wbRounds = bracketSize >= 2 ? this.wbRoundsForSize(bracketSize) : 1;
    const lbMeta = this.buildDoubleElimLbMeta(bracketSize);

    // ——— Winners bracket (round % 100 === 0) ———
    if (round < 1000 && round % 100 === 0) {
      const wr = round / 100;
      let updatedNextMatch = null;

      if (wr < wbRounds) {
        const nextRound = (wr + 1) * 100;
        const nextMatchNumber = Math.ceil(M / 2);
        const slot = M % 2 === 1 ? 'team1Id' : 'team2Id';
        updatedNextMatch = await this.placeTeamInMatch(
          tournamentId,
          nextRound,
          nextMatchNumber,
          slot,
          winnerTeamId
        );
      } else {
        // WB final winner → GF team1
        updatedNextMatch = await this.placeTeamInMatch(
          tournamentId,
          1000,
          1,
          'team1Id',
          winnerTeamId
        );
      }

      // Loser drops (byes have no loser)
      if (loserTeamId) {
        if (bracketSize === 2) {
          // Straight to GF as LB side
          await this.placeTeamInMatch(tournamentId, 1000, 1, 'team2Id', loserTeamId);
        } else if (wr === 1) {
          const lb = lbMeta[0];
          if (lb) {
            const mn = Math.ceil(M / 2);
            const slot = M % 2 === 1 ? 'team1Id' : 'team2Id';
            await this.placeTeamInMatch(tournamentId, lb.round, mn, slot, loserTeamId);
          }
        } else {
          const lb = lbMeta.find((m) => m.kind === 'drop' && m.wbSource === wr);
          if (lb) {
            await this.placeTeamInMatch(tournamentId, lb.round, M, 'team2Id', loserTeamId);
          }
        }
      }

      return { completed: false, nextMatch: updatedNextMatch };
    }

    // ——— Losers bracket ———
    if (round > 100 && round < 1000 && round % 100 !== 0) {
      const idx = lbMeta.findIndex((m) => m.round === round);
      if (idx < 0) {
        console.warn(`[TOURNAMENT BRACKET] Unknown LB round ${round}`);
        return { completed: false };
      }

      // Second loss — eliminated (no further placement for loser)
      if (idx === lbMeta.length - 1) {
        const gf = await this.placeTeamInMatch(tournamentId, 1000, 1, 'team2Id', winnerTeamId);
        return { completed: false, nextMatch: gf };
      }

      const next = lbMeta[idx + 1];
      let updatedNextMatch = null;
      if (next.kind === 'drop') {
        updatedNextMatch = await this.placeTeamInMatch(
          tournamentId,
          next.round,
          M,
          'team1Id',
          winnerTeamId
        );
      } else if (next.kind === 'purge') {
        const mn = Math.ceil(M / 2);
        const slot = M % 2 === 1 ? 'team1Id' : 'team2Id';
        updatedNextMatch = await this.placeTeamInMatch(
          tournamentId,
          next.round,
          mn,
          slot,
          winnerTeamId
        );
      }

      return { completed: false, nextMatch: updatedNextMatch };
    }

    return { completed: false };
  }
}

