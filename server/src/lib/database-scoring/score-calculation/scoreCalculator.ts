import { v4 as uuidv4 } from 'uuid';
import prisma from '../../prisma';
import { games } from '../../../gamesStore';

// Calculate and store GameScore after each hand using database data
export async function calculateAndStoreGameScore(gameId: string, roundNumber: number) {
  try {
    // Get all round bids for this round
    const round = await prisma.round.findFirst({
      where: { gameId, roundNumber },
      include: { RoundBid: true }
    });
    
    if (!round) {
      console.error(`[DB SCORING ERROR] Round ${roundNumber} not found for game ${gameId}`);
      return null;
    }
    
    // Get current trick counts for this round
    const trickCounts = await prisma.playerTrickCount.findMany({
      where: { roundId: round.id }
    });
    
    // Get previous running totals
    const previousScore = await prisma.gameScore.findFirst({
      where: { gameId },
      orderBy: { roundNumber: 'desc' }
    });
    
    // Get player positions from game
    const game = games.find(g => g.dbGameId === gameId);
    if (!game) {
      console.error(`[DB SCORING ERROR] Game ${gameId} not found in memory`);
      return null;
    }
    
    // Build a map of playerId -> tricksWon from trickCounts
    const playerIdToTricks: Record<string, number> = {};
    for (const tc of trickCounts) {
      playerIdToTricks[tc.playerId] = tc.tricksWon;
    }

    if (game.gameMode === 'SOLO' || game.solo) {
      // SOLO GAME LOGIC - Calculate individual player scores
      console.log('[DB SCORING] Calculating SOLO game scores');
      
      const playerScores = [0, 0, 0, 0];
      const playerBags = [0, 0, 0, 0];
      const playerRunningTotals = [0, 0, 0, 0];
      
      // Get previous individual running totals
      if (previousScore) {
        playerRunningTotals[0] = previousScore.player0RunningTotal || 0;
        playerRunningTotals[1] = previousScore.player1RunningTotal || 0;
        playerRunningTotals[2] = previousScore.player2RunningTotal || 0;
        playerRunningTotals[3] = previousScore.player3RunningTotal || 0;
      }
      
      // Calculate individual player scores for this round
      for (const roundBid of round.RoundBid) {
        const playerIndex = game.players.findIndex(p => p?.id === roundBid.playerId);
        if (playerIndex === -1) continue;
        
        const trickCount = trickCounts.find(tc => tc.playerId === roundBid.playerId);
        const tricks = trickCount?.tricksWon || 0;
        const bidAmount = roundBid.bid;
        
        console.log(`[SOLO SCORING] Player ${playerIndex}: bid=${bidAmount}, tricks=${tricks}`);
        
        if (bidAmount === 0) { // Nil
          const nilValue = 50; // Solo nil value
          if (tricks === 0) {
            playerScores[playerIndex] = nilValue;
            console.log(`[SOLO NIL] Player ${playerIndex} successful nil: +${nilValue}`);
          } else {
            playerScores[playerIndex] = -nilValue;
            playerBags[playerIndex] = tricks;
            console.log(`[SOLO NIL] Player ${playerIndex} failed nil: -${nilValue}, bags=${tricks}`);
          }
        } else if (roundBid.isBlindNil) { // Blind nil
          const blindNilValue = 100; // Solo blind nil value
          if (tricks === 0) {
            playerScores[playerIndex] = blindNilValue;
            console.log(`[SOLO BLIND NIL] Player ${playerIndex} successful blind nil: +${blindNilValue}`);
          } else {
            playerScores[playerIndex] = -blindNilValue;
            playerBags[playerIndex] = tricks;
            console.log(`[SOLO BLIND NIL] Player ${playerIndex} failed blind nil: -${blindNilValue}, bags=${tricks}`);
          }
        } else { // Regular bid
          if (tricks >= bidAmount) {
            playerScores[playerIndex] = bidAmount * 10;
            playerBags[playerIndex] = Math.max(0, tricks - bidAmount);
            console.log(`[SOLO REGULAR] Player ${playerIndex} made bid: +${bidAmount * 10}, bags=${playerBags[playerIndex]}`);
          } else {
            playerScores[playerIndex] = -bidAmount * 10;
            console.log(`[SOLO REGULAR] Player ${playerIndex} failed bid: -${bidAmount * 10}`);
          }
        }
      }
      
      // Apply bag penalties for solo (reset at 5, -50 penalty per player)
      for (let i = 0; i < 4; i++) {
        const currentBags = (previousScore ? (previousScore[`player${i}Bags` as keyof typeof previousScore] as number) || 0 : 0) + playerBags[i];
        let remainingBags = currentBags;
        
        while (remainingBags >= 5) {
          playerScores[i] -= 50;
          remainingBags -= 5;
          console.log(`[SOLO BAG PENALTY] Player ${i} hit 5+ bags, applied -50 penalty. Remaining bags: ${remainingBags}`);
        }
        
        playerBags[i] = remainingBags;
        playerRunningTotals[i] += playerScores[i];
      }
      
      // Store solo game scores
      const gameScore = await prisma.gameScore.upsert({
        where: { gameId_roundNumber: { gameId, roundNumber } as any },
        update: {
          // Keep team scores for compatibility (set to 0 for solo)
          team1Score: 0,
          team2Score: 0,
          team1Bags: 0,
          team2Bags: 0,
          team1RunningTotal: 0,
          team2RunningTotal: 0,
          // Individual player scores
          player0Score: playerScores[0],
          player1Score: playerScores[1],
          player2Score: playerScores[2],
          player3Score: playerScores[3],
          player0Bags: playerBags[0],
          player1Bags: playerBags[1],
          player2Bags: playerBags[2],
          player3Bags: playerBags[3],
          player0RunningTotal: playerRunningTotals[0],
          player1RunningTotal: playerRunningTotals[1],
          player2RunningTotal: playerRunningTotals[2],
          player3RunningTotal: playerRunningTotals[3],
          updatedAt: new Date()
        },
        create: {
          id: uuidv4(),
          gameId,
          roundNumber,
          // Team scores (set to 0 for solo)
          team1Score: 0,
          team2Score: 0,
          team1Bags: 0,
          team2Bags: 0,
          team1RunningTotal: 0,
          team2RunningTotal: 0,
          // Individual player scores
          player0Score: playerScores[0],
          player1Score: playerScores[1],
          player2Score: playerScores[2],
          player3Score: playerScores[3],
          player0Bags: playerBags[0],
          player1Bags: playerBags[1],
          player2Bags: playerBags[2],
          player3Bags: playerBags[3],
          player0RunningTotal: playerRunningTotals[0],
          player1RunningTotal: playerRunningTotals[1],
          player2RunningTotal: playerRunningTotals[2],
          player3RunningTotal: playerRunningTotals[3]
        }
      });
      
      console.log(`[DB SCORING] Solo game ${gameId} Round ${roundNumber} scores stored:`, {
        player0: `${playerScores[0]} (${playerRunningTotals[0]})`,
        player1: `${playerScores[1]} (${playerRunningTotals[1]})`,
        player2: `${playerScores[2]} (${playerRunningTotals[2]})`,
        player3: `${playerScores[3]} (${playerRunningTotals[3]})`
      });
      
      return gameScore;
      
    } else {
      // PARTNERS GAME LOGIC - Calculate team scores (existing logic)
      console.log('[DB SCORING] Calculating PARTNERS game scores');
      
      const team1 = [0, 2];
      const team2 = [1, 3];
      
      // Calculate team bids (excluding nil bids)
      let team1Bid = 0, team2Bid = 0;
      let team1Tricks = 0, team2Tricks = 0;
      
      // Sum tricks per team from all four seats using in-memory seating
      for (let idx = 0; idx < game.players.length; idx++) {
        const player = game.players[idx];
        if (!player) continue;
        const tricks = playerIdToTricks[player.id] || 0;
        if (team1.includes(idx)) {
          team1Tricks += tricks;
        } else if (team2.includes(idx)) {
          team2Tricks += tricks;
        }
      }

      // Sum bids per team from RoundBid rows (missing rows imply bid 0)
      for (const roundBid of round.RoundBid) {
        const playerIndex = game.players.findIndex(p => p?.id === roundBid.playerId);
        if (playerIndex === -1) continue;
        if (roundBid.bid > 0) {
          if (team1.includes(playerIndex)) team1Bid += roundBid.bid;
          else if (team2.includes(playerIndex)) team2Bid += roundBid.bid;
        }
      }
      
      console.log(`[DB SCORING] Round ${roundNumber} - Team 1: bid ${team1Bid}, tricks ${team1Tricks}`);
      console.log(`[DB SCORING] Round ${roundNumber} - Team 2: bid ${team2Bid}, tricks ${team2Tricks}`);
      
      // Calculate team scores using correct nil logic
      let team1Score = 0, team2Score = 0;
      let team1Bags = 0, team2Bags = 0;
      
      // Handle nil and blind nil scoring
      for (const roundBid of round.RoundBid) {
        const playerIndex = game.players.findIndex(p => p?.id === roundBid.playerId);
        if (playerIndex === -1) continue;
        
        const trickCount = trickCounts.find(tc => tc.playerId === roundBid.playerId);
        const tricks = trickCount?.tricksWon || 0;
        
        if (roundBid.bid === 0) { // Nil bid
          const nilValue = 100; // Partners nil value
          if (tricks === 0) { // Successful nil
            if (team1.includes(playerIndex)) {
              team1Score += nilValue;
              console.log(`[NIL SCORING] Player ${playerIndex} successful nil: +${nilValue} (partners)`);
            } else {
              team2Score += nilValue;
              console.log(`[NIL SCORING] Player ${playerIndex} successful nil: +${nilValue} (partners)`);
            }
          } else { // Failed nil
            if (team1.includes(playerIndex)) {
              team1Score -= nilValue;
              console.log(`[NIL SCORING] Player ${playerIndex} failed nil: -${nilValue} (partners)`);
            } else {
              team2Score -= nilValue;
              console.log(`[NIL SCORING] Player ${playerIndex} failed nil: -${nilValue} (partners)`);
            }
          }
        } else if (roundBid.isBlindNil) { // Blind nil
          const blindNilValue = 200; // Partners blind nil value
          if (tricks === 0) { // Successful blind nil
            if (team1.includes(playerIndex)) {
              team1Score += blindNilValue;
              console.log(`[BLIND NIL SCORING] Player ${playerIndex} successful blind nil: +${blindNilValue} (partners)`);
            } else {
              team2Score += blindNilValue;
              console.log(`[BLIND NIL SCORING] Player ${playerIndex} successful blind nil: +${blindNilValue} (partners)`);
            }
          } else { // Failed blind nil
            if (team1.includes(playerIndex)) {
              team1Score -= blindNilValue;
              console.log(`[BLIND NIL SCORING] Player ${playerIndex} failed blind nil: -${blindNilValue} (partners)`);
            } else {
              team2Score -= blindNilValue;
              console.log(`[BLIND NIL SCORING] Player ${playerIndex} failed blind nil: -${blindNilValue} (partners)`);
            }
          }
        } else { // Regular bid
          if (tricks >= roundBid.bid) {
            const score = roundBid.bid * 10;
            const bags = tricks - roundBid.bid;
            if (team1.includes(playerIndex)) {
              team1Score += score;
              team1Bags += bags;
            } else {
              team2Score += score;
              team2Bags += bags;
            }
            console.log(`[REGULAR SCORING] Player ${playerIndex} made bid ${roundBid.bid}: +${score}, bags=${bags}`);
          } else {
            const score = -(roundBid.bid * 10);
            if (team1.includes(playerIndex)) {
              team1Score += score;
            } else {
              team2Score += score;
            }
            console.log(`[REGULAR SCORING] Player ${playerIndex} failed bid ${roundBid.bid}: ${score}`);
          }
        }
      }
      
      // Get previous running totals
      let team1RunningTotal = previousScore?.team1RunningTotal || 0;
      let team2RunningTotal = previousScore?.team2RunningTotal || 0;
      let currentTeam1Bags = (previousScore?.team1Bags || 0) + team1Bags;
      let currentTeam2Bags = (previousScore?.team2Bags || 0) + team2Bags;
      
      team1RunningTotal += team1Score;
      team2RunningTotal += team2Score;
      
      // Apply bag penalties based on game mode
      // Partners mode: reset bags at 10, penalty -100 points per team
      if (currentTeam1Bags >= 10) {
        team1RunningTotal -= 100;
        currentTeam1Bags -= 10;
        console.log(`[PARTNERS BAG PENALTY] Team 1 hit 10+ bags, applied -100 penalty. New score: ${team1RunningTotal}, New bags: ${currentTeam1Bags}`);
      }
      if (currentTeam2Bags >= 10) {
        team2RunningTotal -= 100;
        currentTeam2Bags -= 10;
        console.log(`[PARTNERS BAG PENALTY] Team 2 hit 10+ bags, applied -100 penalty. New score: ${team2RunningTotal}, New bags: ${currentTeam2Bags}`);
      }
      
      const gameScore = await prisma.gameScore.upsert({
        where: { gameId_roundNumber: { gameId, roundNumber } as any },
        update: {
          team1Score,
          team2Score,
          team1Bags: currentTeam1Bags,
          team2Bags: currentTeam2Bags,
          team1RunningTotal,
          team2RunningTotal,
          updatedAt: new Date()
        },
        create: {
          id: uuidv4(),
          gameId,
          roundNumber,
          team1Score,
          team2Score,
          team1Bags: currentTeam1Bags,
          team2Bags: currentTeam2Bags,
          team1RunningTotal,
          team2RunningTotal
        }
      });
      
      console.log(`[DB SCORING] Partners game ${gameId} Round ${roundNumber} scores stored: Team 1: ${team1Score} (${team1RunningTotal}), Team 2: ${team2Score} (${team2RunningTotal})`);
      return gameScore;
    }
    
  } catch (error) {
    console.error(`[DB SCORING ERROR] Failed to calculate and store game score for game ${gameId} round ${roundNumber}:`, error);
    throw error;
  }
}
