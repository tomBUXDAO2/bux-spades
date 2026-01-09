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
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { status: 'REGISTRATION_CLOSED' },
      });

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
      
      // Pair them up
      for (let i = 0; i < shuffled.length; i += 2) {
        if (i + 1 < shuffled.length) {
          const player1 = shuffled[i];
          const player2 = shuffled[i + 1];
          
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
   * Ensures each round has double the games of the next round
   * Example: 9 teams -> 7 byes, 2 play -> 8 teams next round
   * Example: 21 teams -> 11 byes, 10 play (5 winners) -> 16 teams next round
   */
  static async generateSingleEliminationBracket(tournamentId, teams) {
    const numTeams = teams.length;
    
    // Calculate next round size (next power of 2)
    // Find smallest power of 2 >= numTeams
    let nextRoundSize = Math.pow(2, Math.ceil(Math.log2(numTeams)));
    
    // Calculate byes: we need nextRoundSize teams in next round
    // If numPlaying teams play, we get numPlaying/2 winners
    // So: numPlaying/2 + numByes = nextRoundSize
    // And: numPlaying + numByes = numTeams
    // Solving: numByes = 2 * nextRoundSize - numTeams
    //          numPlaying = numTeams - numByes
    const numByes = 2 * nextRoundSize - numTeams;
    const numPlaying = numTeams - numByes;
    
    // Seed teams (random for now, could be based on rating later)
    const seededTeams = [...teams].sort(() => Math.random() - 0.5);
    
    // Create first round matches
    let matchNumber = 1;
    const matches = [];
    let round = 1;
    
    // Assign byes first (teams that automatically advance)
    let teamIndex = 0;
    for (let i = 0; i < numByes && teamIndex < seededTeams.length; i++) {
      // Teams with byes don't need a match, they advance automatically
      // We'll track them for bracket display but don't create a match
      teamIndex++;
    }
    
    // Create matches for teams that need to play
    const teamsPlaying = seededTeams.slice(teamIndex);
    for (let i = 0; i < teamsPlaying.length; i += 2) {
      const team1 = teamsPlaying[i];
      const team2 = teamsPlaying[i + 1] || null;
      
      matches.push({
        tournamentId,
        round,
        matchNumber,
        team1Id: team1.id,
        team2Id: team2?.id || null,
        status: team2 ? 'PENDING' : 'COMPLETED', // Odd team gets bye
        winnerId: team2 ? null : team1.id,
      });
      matchNumber++;
    }

    // Create subsequent rounds
    let currentRoundSize = nextRoundSize;
    round = 2;
    
    while (currentRoundSize > 1) {
      matchNumber = 1;
      for (let i = 0; i < currentRoundSize; i += 2) {
        matches.push({
          tournamentId,
          round,
          matchNumber,
          team1Id: null, // Will be filled when previous round completes
          team2Id: null,
          status: 'PENDING',
        });
        matchNumber++;
      }
      currentRoundSize /= 2;
      round++;
    }

    // Insert matches into database
    await prisma.tournamentMatch.createMany({
      data: matches,
    });

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
      await this.advanceBracket(tournamentId, match, winnerTeamId);

      return match;
    } catch (error) {
      console.error('[TOURNAMENT BRACKET] Error recording match result:', error);
      throw error;
    }
  }

  /**
   * Advance bracket after a match completes
   */
  static async advanceBracket(tournamentId, completedMatch, winnerTeamId) {
    const nextRound = completedMatch.round + (completedMatch.round < 1000 ? 100 : 0);
    const nextMatchNumber = Math.ceil(completedMatch.matchNumber / 2);

    // Find the next match
    const nextMatch = await prisma.tournamentMatch.findFirst({
      where: {
        tournamentId,
        round: nextRound,
        matchNumber: nextMatchNumber,
      },
    });

    if (nextMatch) {
      // Determine which slot (team1 or team2) based on match number
      const isFirstSlot = completedMatch.matchNumber % 2 === 1;
      
      await prisma.tournamentMatch.update({
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
      // Tournament complete
      const finalMatch = await prisma.tournamentMatch.findFirst({
        where: {
          tournamentId,
          round: { gte: 1000 }, // Grand finals or final round
        },
        orderBy: { round: 'desc' },
      });

      if (finalMatch && finalMatch.winnerId) {
        await prisma.tournament.update({
          where: { id: tournamentId },
          data: { status: 'COMPLETED' },
        });
      }
    }
  }
}

