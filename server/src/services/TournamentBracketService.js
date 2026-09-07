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
   * Generate double elimination bracket
   * Creates winners bracket and losers bracket
   */
  static async generateDoubleEliminationBracket(tournamentId, teams) {
    const numTeams = teams.length;
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(numTeams)));
    
    // Seed teams
    const seededTeams = [...teams].sort(() => Math.random() - 0.5);
    
    const matches = [];
    let matchNumber = 1;

    // Winners bracket - first round
    let round = 1;
    let teamIndex = 0;
    
    for (let i = 0; i < bracketSize; i += 2) {
      const team1 = seededTeams[teamIndex] || null;
      const team2 = (i + 1 < bracketSize && teamIndex + 1 < seededTeams.length) 
        ? seededTeams[teamIndex + 1] 
        : null;

      if (team1) {
        matches.push({
          tournamentId,
          round: round * 100, // Winners bracket rounds: 100, 200, 300, etc.
          matchNumber,
          team1Id: team1.id,
          team2Id: team2?.id || null,
          status: team2 ? 'PENDING' : 'COMPLETED',
          winnerId: team2 ? null : team1.id,
        });
        matchNumber++;
      }
      
      teamIndex += 2;
    }

    // Generate subsequent winners bracket rounds
    let currentRoundSize = bracketSize / 2;
    round = 2;
    
    while (currentRoundSize > 1) {
      matchNumber = 1;
      for (let i = 0; i < currentRoundSize; i += 2) {
        matches.push({
          tournamentId,
          round: round * 100,
          matchNumber,
          team1Id: null,
          team2Id: null,
          status: 'PENDING',
        });
        matchNumber++;
      }
      currentRoundSize /= 2;
      round++;
    }

    // Losers bracket - starts after first round of winners
    // Losers from winners bracket round 1 go to losers bracket round 1
    // This is simplified - full double elim has more complex bracket structure
    const losersRound = 101; // Losers bracket rounds: 101, 102, 201, etc.
    matchNumber = 1;
    
    // First losers bracket round (losers from winners round 1)
    const numLosersFromFirstRound = Math.floor(bracketSize / 2);
    for (let i = 0; i < numLosersFromFirstRound; i += 2) {
      matches.push({
        tournamentId,
        round: losersRound,
        matchNumber,
        team1Id: null,
        team2Id: null,
        status: 'PENDING',
      });
      matchNumber++;
    }

    // Grand finals (winners bracket winner vs losers bracket winner)
    matches.push({
      tournamentId,
      round: 1000, // Grand finals
      matchNumber: 1,
      team1Id: null, // Winners bracket winner
      team2Id: null, // Losers bracket winner
      status: 'PENDING',
    });

    await prisma.tournamentMatch.createMany({
      data: matches,
    });

    return matches;
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

      // Update match
      await prisma.tournamentMatch.update({
        where: { id: matchId },
        data: {
          winnerId: winnerTeamId,
          status: 'COMPLETED',
        },
      });

      // Advance bracket - find next round matches and update them
      const advanceResult = await this.advanceBracket(tournamentId, match, winnerTeamId);

      return { match, advanceResult };
    } catch (error) {
      console.error('[TOURNAMENT BRACKET] Error recording match result:', error);
      throw error;
    }
  }

  /**
   * Advance bracket after a match completes
   */
  static async advanceBracket(tournamentId, completedMatch, winnerTeamId) {
    // Single elim uses rounds 1,2,3… Double winners use 100,200,… Losers 101+, GF 1000+
    let nextRound;
    if (completedMatch.round >= 1000) {
      nextRound = completedMatch.round + 1;
    } else if (completedMatch.round >= 100) {
      nextRound = completedMatch.round + 100;
    } else {
      nextRound = completedMatch.round + 1;
    }
    const nextMatchNumber = Math.ceil(completedMatch.matchNumber / 2);

    // Find the next match
    const nextMatch = await prisma.tournamentMatch.findFirst({
      where: {
        tournamentId,
        round: nextRound,
        matchNumber: nextMatchNumber,
      },
    });

    let updatedNextMatch = null;
    if (nextMatch) {
      // Determine which slot (team1 or team2) based on match number
      const isFirstSlot = completedMatch.matchNumber % 2 === 1;
      
      updatedNextMatch = await prisma.tournamentMatch.update({
        where: { id: nextMatch.id },
        data: {
          [isFirstSlot ? 'team1Id' : 'team2Id']: winnerTeamId,
        },
      });
    }

    // Check if tournament is complete
    const remainingMatches = await prisma.tournamentMatch.count({
      where: {
        tournamentId,
        status: { not: 'COMPLETED' },
      },
    });

    if (remainingMatches === 0) {
      // Prefer grand final (double) else highest completed round (single)
      const finalMatch =
        (await prisma.tournamentMatch.findFirst({
          where: {
            tournamentId,
            round: { gte: 1000 },
            status: 'COMPLETED',
          },
          orderBy: { round: 'desc' },
        })) ||
        (await prisma.tournamentMatch.findFirst({
          where: {
            tournamentId,
            status: 'COMPLETED',
            winnerId: { not: null },
          },
          orderBy: { round: 'desc' },
        }));

      if (finalMatch && finalMatch.winnerId) {
        await prisma.tournament.update({
          where: { id: tournamentId },
          data: { status: 'COMPLETED' },
        });
        
        return {
          completed: true,
          winnerTeamId: finalMatch.winnerId,
          nextMatch: updatedNextMatch,
        };
      }
    }
    
    // Check if only one team remains (tournament winner)
    const allMatches = await prisma.tournamentMatch.findMany({
      where: { tournamentId },
      include: {
        tournament: true,
      },
    });
    
    const activeTeams = new Set();
    allMatches.forEach(match => {
      if (match.team1Id && match.status !== 'COMPLETED') activeTeams.add(match.team1Id);
      if (match.team2Id && match.status !== 'COMPLETED') activeTeams.add(match.team2Id);
    });
    
    // If only one team left and no pending matches, they're the winner
    if (activeTeams.size === 1 && remainingMatches === 0) {
      const onlyWinner = Array.from(activeTeams)[0];
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { status: 'COMPLETED' },
      });
      return { completed: true, winnerTeamId: onlyWinner, nextMatch: updatedNextMatch };
    }

    return { completed: false, nextMatch: updatedNextMatch };
  }
}

