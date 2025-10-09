import { prisma } from '../config/databaseFirst.js';

/**
 * DATABASE-FIRST SCORING SERVICE
 * Single source of truth for all scoring calculations
 * All scoring logic is computed from database state
 */
export class ScoringService {
  
  /**
   * Calculate and update scores for a completed round
   * @param {string} gameId - The game ID
   * @param {string} roundId - The round ID
   * @returns {Promise<Object>} - Calculated scores
   */
  static async calculateRoundScores(gameId, roundId) {
    try {
      console.log(`[SCORING] Calculating scores for round ${roundId}`);
      
      // Get game info to determine if it's partners or solo
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: { mode: true, isRated: true }
      });

      if (!game) {
        throw new Error(`Game ${gameId} not found`);
      }

      const isPartners = game.mode === 'PARTNERS';
      
      // Get all player stats for this round
      const playerStats = await prisma.playerRoundStats.findMany({
        where: { roundId },
        orderBy: { seatIndex: 'asc' },
        include: {
          user: true
        }
      });

      // For solo games, calculate total bags for each player from previous rounds
      if (!isPartners) {
        for (const player of playerStats) {
          // Get all previous rounds for this player to calculate total bags
          const currentRound = await prisma.round.findUnique({
            where: { id: roundId },
            select: { roundNumber: true }
          });
          
          const previousRounds = await prisma.playerRoundStats.findMany({
            where: {
              userId: player.userId,
              round: { 
                gameId,
                roundNumber: { lt: currentRound?.roundNumber || 0 }
              }
            },
            select: { bagsThisRound: true }
          });
          
          // Sum up all previous bags
          const totalBags = previousRounds.reduce((sum, round) => sum + (round.bagsThisRound || 0), 0);
          player.bagsTotal = totalBags;
          console.log(`[SCORING] Player ${player.seatIndex} has ${totalBags} total bags from previous rounds`);
        }
      }

      if (playerStats.length !== 4) {
        throw new Error(`Expected 4 player stats, found ${playerStats.length}`);
      }

      // Calculate scores based on game mode
      if (isPartners) {
        return await this.calculatePartnersScores(gameId, roundId, playerStats);
      } else {
        return await this.calculateSoloScores(gameId, roundId, playerStats);
      }
    } catch (error) {
      console.error('[SCORING] Error calculating round scores:', error);
      throw error;
    }
  }

  /**
   * Calculate scores for partners game
   */
  static async calculatePartnersScores(gameId, roundId, playerStats) {
    console.log('[SCORING] Calculating partners scores');
    
    // Group players by team (0,1 vs 2,3)
    const team0Players = playerStats.filter(p => p.seatIndex % 2 === 0);
    const team1Players = playerStats.filter(p => p.seatIndex % 2 === 1);

      // Calculate team totals
      const team0Bid = team0Players.reduce((sum, p) => sum + (p.bid || 0), 0);
      const team0Tricks = team0Players.reduce((sum, p) => sum + p.tricksWon, 0);
      const team1Bid = team1Players.reduce((sum, p) => sum + (p.bid || 0), 0);
      const team1Tricks = team1Players.reduce((sum, p) => sum + p.tricksWon, 0);

      console.log(`[SCORING] Team 0: bid ${team0Bid}, tricks ${team0Tricks}`);
      console.log(`[SCORING] Team 1: bid ${team1Bid}, tricks ${team1Tricks}`);

      // Calculate team scores
      const team0Score = this.calculateTeamScore(team0Bid, team0Tricks, team0Players);
      const team1Score = this.calculateTeamScore(team1Bid, team1Tricks, team1Players);

      // Update bagsThisRound for each player - individual calculation for stats
      for (const player of playerStats) {
        const playerBid = player.bid || 0;
        const playerTricks = player.tricksWon;
        
        // Individual bags: player tricks minus player bid (for stats only)
        let bagsThisRound = Math.max(0, playerTricks - playerBid);

        console.log(`[SCORING] Seat ${player.seatIndex}: bid ${playerBid}, tricks ${playerTricks}, bags ${bagsThisRound}`);

        // Update player stats
        await prisma.playerRoundStats.update({
          where: { id: player.id },
          data: { bagsThisRound }
        });
      }

    // Calculate running totals from previous rounds
    const previousScores = await prisma.roundScore.findMany({
      where: { 
        Round: { gameId } 
      },
      orderBy: { Round: { roundNumber: 'asc' } }
    });

    const previousTeam0Total = previousScores.reduce((sum, score) => sum + (score.team0Score || 0), 0);
    const previousTeam1Total = previousScores.reduce((sum, score) => sum + (score.team1Score || 0), 0);

    const team0RunningTotal = previousTeam0Total + team0Score;
    const team1RunningTotal = previousTeam1Total + team1Score;

    // Create RoundScore entry
    await prisma.roundScore.create({
      data: {
        id: roundId, // Use roundId as the ID for easy lookup
        roundId,
        team0Score,
        team1Score,
        team0Bags: Math.max(0, team0Tricks - team0Bid),
        team1Bags: Math.max(0, team1Tricks - team1Bid),
        team0RunningTotal,
        team1RunningTotal
      }
    });

    return {
      team0Score,
      team1Score,
      team0Bags: Math.max(0, team0Tricks - team0Bid),
      team1Bags: Math.max(0, team1Tricks - team1Bid),
      gameMode: 'PARTNERS'
    };
  }

  /**
   * Calculate scores for solo game
   */
  static async calculateSoloScores(gameId, roundId, playerStats) {
    console.log('[SCORING] Calculating solo scores');
    
    // Calculate individual player scores
    const playerScores = [];
    for (const player of playerStats) {
      const bid = player.bid || 0;
      const tricksWon = player.tricksWon;
      
      let pointsThisRound = 0;
      let bagsThisRound = 0;
      
      // Calculate points based on bid vs tricks
      if (bid === 0) {
        // Nil bid - Solo mode: 50/-50, blind nils: 100/-100
        if (tricksWon === 0) {
          // Made nil
          pointsThisRound = player.isBlindNil ? 100 : 50;
        } else {
          // Failed nil
          pointsThisRound = player.isBlindNil ? -100 : -50;
        }
      } else {
        // Regular bid
        if (tricksWon === bid) {
          // Made bid exactly
          pointsThisRound = bid * 10;
        } else if (tricksWon > bid) {
          // Made bid + overtricks
          pointsThisRound = bid * 10 + (tricksWon - bid);
          bagsThisRound = tricksWon - bid;
        } else {
          // Failed bid
          pointsThisRound = -(bid * 10);
        }
      }

      // Calculate total bags (previous bags + new bags this round)
      const totalBags = (player.bagsTotal || 0) + bagsThisRound;
      
      // Solo mode bag penalty: -50 points and reset bags to 0 when reaching 5 bags
      let finalPointsThisRound = pointsThisRound;
      let finalBagsThisRound = bagsThisRound;
      
      if (totalBags >= 5) {
        finalPointsThisRound -= 50; // Apply bag penalty
        finalBagsThisRound = 0; // Reset bags to 0
        console.log(`[SCORING] Player ${player.seatIndex} hit 5 bags (${totalBags}), applying -50 penalty and resetting bags`);
      } else {
        finalBagsThisRound = totalBags; // Keep accumulating bags
      }

      // Update player stats with final bags
      await prisma.playerRoundStats.update({
        where: { id: player.id },
        data: { bagsThisRound: finalBagsThisRound }
      });
      
      playerScores.push({
        seatIndex: player.seatIndex,
        pointsThisRound: finalPointsThisRound,
        bagsThisRound: finalBagsThisRound
      });
    }
    
    // Calculate running totals from previous rounds
    const previousScores = await prisma.roundScore.findMany({
      where: { 
        Round: { gameId } 
      },
      orderBy: { Round: { roundNumber: 'asc' } }
    });
    
    // Get previous running totals
    const lastScore = previousScores.length > 0 ? previousScores[previousScores.length - 1] : null;
    const player0Running = (lastScore?.player0Running || 0) + playerScores[0].pointsThisRound;
    const player1Running = (lastScore?.player1Running || 0) + playerScores[1].pointsThisRound;
    const player2Running = (lastScore?.player2Running || 0) + playerScores[2].pointsThisRound;
    const player3Running = (lastScore?.player3Running || 0) + playerScores[3].pointsThisRound;
    
    // Create RoundScore entry for solo game
    await prisma.roundScore.create({
      data: {
        id: roundId, // Use roundId as the ID for easy lookup
        roundId,
        player0Score: playerScores[0].pointsThisRound,
        player1Score: playerScores[1].pointsThisRound,
        player2Score: playerScores[2].pointsThisRound,
        player3Score: playerScores[3].pointsThisRound,
        player0Running,
        player1Running,
        player2Running,
        player3Running
      }
    });

    return {
      gameMode: 'SOLO',
      players: playerScores.map(p => ({
        seatIndex: p.seatIndex,
        pointsThisRound: p.pointsThisRound,
        bagsThisRound: p.bagsThisRound,
        runningTotal: p.seatIndex === 0 ? player0Running :
                      p.seatIndex === 1 ? player1Running :
                      p.seatIndex === 2 ? player2Running :
                      player3Running
      }))
    };
  }

  /**
   * Calculate team score for partners game
   */
  static calculateTeamScore(teamBid, teamTricks, teamPlayers) {
    // Handle nil bids first
    let nilBonus = 0;
    let hasNil = false;
    let hasBlindNil = false;

    for (const player of teamPlayers) {
      if (player.bid === 0) {
        if (player.tricksWon === 0) {
          // Made nil
          if (player.isBlindNil) {
            nilBonus += 200;
            hasBlindNil = true;
          } else {
            nilBonus += 100;
            hasNil = true;
          }
        } else {
          // Failed nil
          if (player.isBlindNil) {
            nilBonus -= 200;
            hasBlindNil = true;
          } else {
            nilBonus -= 100;
            hasNil = true;
          }
        }
      }
    }

    // Calculate regular bid score
    let regularScore = 0;
    if (teamTricks >= teamBid) {
      // Made bid: bid * 10 points
      regularScore = teamBid * 10;
    } else {
      // Failed bid: bid * -10 points
      regularScore = teamBid * -10;
    }

    // Calculate bag penalties (1 point per bag)
    const bags = Math.max(0, teamTricks - teamBid);
    const bagPenalty = bags * 1;
    
    const totalScore = regularScore + nilBonus + bagPenalty;
    
    console.log(`[SCORING] Team bid ${teamBid}, tricks ${teamTricks}, regular ${regularScore}, nil bonus ${nilBonus}, bags ${bags}, bag penalty ${bagPenalty}, total ${totalScore}`);
    
    return totalScore;
  }

  /**
   * Check if game is complete (reached target score)
   * @param {string} gameId - The game ID
   * @returns {Promise<{isComplete: boolean, winner?: string, reason?: string}>}
   */
  static async checkGameComplete(gameId) {
    try {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: { mode: true, minPoints: true, maxPoints: true }
      });

      if (!game) {
        throw new Error(`Game ${gameId} not found`);
      }

      // Get all round scores for this game
      const roundScores = await prisma.roundScore.findMany({
        where: { 
          Round: { gameId }
        },
        orderBy: { Round: { roundNumber: 'asc' } }
      });

      if (roundScores.length === 0) {
        return { isComplete: false };
      }

        // Use the running totals from the latest round
        const latestRoundScore = roundScores[roundScores.length - 1];
        const team0RunningTotal = latestRoundScore?.team0RunningTotal || 0;
        const team1RunningTotal = latestRoundScore?.team1RunningTotal || 0;

      console.log(`[SCORING] Team 0 total: ${team0RunningTotal}, Team 1 total: ${team1RunningTotal}`);
      console.log(`[SCORING] Game limits: min ${game.minPoints}, max ${game.maxPoints}`);

      // For solo games, check individual player scores
      if (game.mode === 'SOLO') {
        const player0Running = latestRoundScore?.player0Running || 0;
        const player1Running = latestRoundScore?.player1Running || 0;
        const player2Running = latestRoundScore?.player2Running || 0;
        const player3Running = latestRoundScore?.player3Running || 0;
        
        const playerScores = [player0Running, player1Running, player2Running, player3Running];
        console.log(`[SCORING] Solo game - Player scores: [${playerScores.join(', ')}]`);
        
        const minPoints = game.minPoints || -100; // Default to -100 for solo
        const maxPoints = game.maxPoints || 100;  // Default to 100 for solo
        
        // Check if any player has reached the target score
        for (let i = 0; i < playerScores.length; i++) {
          const playerScore = playerScores[i];
          if (playerScore >= maxPoints || playerScore <= minPoints) {
            const winner = `PLAYER_${i}`;
            const reason = playerScore >= maxPoints 
              ? `Player ${i} reached ${maxPoints} points`
              : `Player ${i} reached ${minPoints} points`;
            
            console.log(`[SCORING] Solo game complete: ${reason}`);
            return { 
              isComplete: true, 
              winner,
              reason
            };
          }
        }
        
        return { isComplete: false };
      }

      // For partners mode, check team scores
      const minPoints = game.minPoints || -500; // Default to -500 if not set
      const maxPoints = game.maxPoints || 500;  // Default to 500 if not set
      
      const team0Exceeded = team0RunningTotal >= maxPoints || team0RunningTotal <= minPoints;
      const team1Exceeded = team1RunningTotal >= maxPoints || team1RunningTotal <= minPoints;
      
      if (team0Exceeded && team1Exceeded) {
        // Both teams exceeded - play one more round if scores are level
        if (team0RunningTotal === team1RunningTotal) {
          console.log(`[SCORING] Both teams exceeded limits with equal scores - play one more round`);
        return { isComplete: false };
      }
        // Winner is whoever has most points
        const winner = team0RunningTotal > team1RunningTotal ? 'TEAM_0' : 'TEAM_1';
        return { 
          isComplete: true, 
          winner,
          reason: `Both teams exceeded limits, ${winner} has most points`
        };
      }

      if (team0Exceeded) {
        return { 
          isComplete: true, 
          winner: 'TEAM_0',
          reason: `Team 0 reached ${team0RunningTotal >= maxPoints ? maxPoints : minPoints} points`
        };
      }

      if (team1Exceeded) {
        return { 
          isComplete: true, 
          winner: 'TEAM_1',
          reason: `Team 1 reached ${team1RunningTotal >= maxPoints ? maxPoints : minPoints} points`
        };
      }

      // Game continues - no winner yet
      return { isComplete: false };
    } catch (error) {
      console.error('[SCORING] Error checking game completion:', error);
      throw error;
    }
  }

  /**
   * Complete a game and create game result
   * @param {string} gameId - The game ID
   * @param {string} winner - The winner
   * @param {string} reason - Reason for completion
   */
  static async completeGame(gameId, winner, reason) {
    try {
      console.log(`[SCORING] Completing game ${gameId}, winner: ${winner}`);

      // Get game info
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: { currentRound: true, mode: true }
      });

      if (!game) {
        throw new Error(`Game ${gameId} not found`);
      }

      // Get final stats
      const allPlayerStats = await prisma.playerRoundStats.findMany({
        where: { 
          round: { gameId }
        },
        orderBy: { seatIndex: 'asc' }
      });

      // Get final scores from latest round
      const latestRoundScore = await prisma.roundScore.findFirst({
        where: { 
          Round: { gameId }
        },
        orderBy: { Round: { roundNumber: 'desc' } }
      });

      // Create game result - only team scores for partners games
      const gameResultData = {
          gameId,
          winner,
        totalRounds: game.currentRound,
        totalTricks: game.currentRound * 13, // 13 tricks per round
        meta: { reason }
      };

      // Only add team scores for partners games, individual scores for solo games
      if (game.mode === 'PARTNERS') {
        gameResultData.team0Final = latestRoundScore?.team0RunningTotal || 0;
        gameResultData.team1Final = latestRoundScore?.team1RunningTotal || 0;
      } else {
        // For solo games, get individual player totals
        const playerTotals = [0, 0, 0, 0];
        for (const stat of allPlayerStats) {
          playerTotals[stat.seatIndex] += stat.tricksWon || 0;
        }

        gameResultData.player0Final = playerTotals[0];
        gameResultData.player1Final = playerTotals[1];
        gameResultData.player2Final = playerTotals[2];
        gameResultData.player3Final = playerTotals[3];
      }

      await prisma.gameResult.create({
        data: gameResultData
      });

      // Update game status - reset currentTrick to 0 to satisfy constraint
      await prisma.game.update({
        where: { id: gameId },
        data: {
          status: 'FINISHED',
          currentTrick: 0, // Reset to satisfy constraint
          finishedAt: new Date()
        }
      });

      console.log(`[SCORING] Game ${gameId} completed successfully`);
    } catch (error) {
      console.error('[SCORING] Error completing game:', error);
      throw error;
    }
  }

  /**
   * Get current scores for a game (for display purposes)
   * @param {string} gameId - The game ID
   * @returns {Promise<Object>} - Current scores
   */
  static async getCurrentScores(gameId) {
    try {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: { mode: true }
      });

      if (!game) {
        return { team0Total: 0, team1Total: 0, currentRound: 0 };
      }

      const rounds = await prisma.round.count({
        where: { gameId }
      });

      if (game.mode === 'PARTNERS') {
        // Calculate team totals from all rounds
        const allPlayerStats = await prisma.playerRoundStats.findMany({
          where: { 
            round: { gameId }
          }
        });

        const team0Total = allPlayerStats
          .filter(p => p.seatIndex % 2 === 0)
          .reduce((sum, p) => sum + p.tricksWon, 0);
        const team1Total = allPlayerStats
          .filter(p => p.seatIndex % 2 === 1)
          .reduce((sum, p) => sum + p.tricksWon, 0);

        return {
          team0Total,
          team1Total,
          currentRound: rounds
        };
      } else {
        // Solo game - return individual scores
        const allPlayerStats = await prisma.playerRoundStats.findMany({
          where: { 
            round: { gameId }
          },
          orderBy: { seatIndex: 'asc' }
      });

      return {
          players: allPlayerStats.map(p => ({
            seatIndex: p.seatIndex,
            tricksWon: p.tricksWon,
            bagsThisRound: p.bagsThisRound
          })),
          currentRound: rounds
        };
      }
    } catch (error) {
      console.error('[SCORING] Error getting current scores:', error);
      return { team0Total: 0, team1Total: 0, currentRound: 0 };
    }
  }
}