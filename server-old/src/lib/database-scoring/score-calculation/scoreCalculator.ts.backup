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
    
    const team1 = [0, 2];
    const team2 = [1, 3];
    
    // Calculate team bids (excluding nil bids)
    let team1Bid = 0, team2Bid = 0;
    let team1Tricks = 0, team2Tricks = 0;
    
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
        const nilValue = (game.gameMode === 'SOLO' || game.solo) ? 50 : 100;
        if (tricks === 0) { // Successful nil
          if (team1.includes(playerIndex)) {
            team1Score += nilValue;
            console.log(`[NIL SCORING] Player ${playerIndex} successful nil: +${nilValue} (${game.gameMode === 'SOLO' || game.solo ? 'solo' : 'partners'})`);
          } else {
            team2Score += nilValue;
            console.log(`[NIL SCORING] Player ${playerIndex} successful nil: +${nilValue} (${game.gameMode === 'SOLO' || game.solo ? 'solo' : 'partners'})`);
          }
        } else { // Failed nil
          if (team1.includes(playerIndex)) {
            team1Score -= nilValue;
            console.log(`[NIL SCORING] Player ${playerIndex} failed nil: -${nilValue} (${game.gameMode === 'SOLO' || game.solo ? 'solo' : 'partners'})`);
          } else {
            team2Score -= nilValue;
            console.log(`[NIL SCORING] Player ${playerIndex} failed nil: -${nilValue} (${game.gameMode === 'SOLO' || game.solo ? 'solo' : 'partners'})`);
          }
        }
      } else if (roundBid.isBlindNil) { // Blind nil
        const blindNilValue = (game.gameMode === 'SOLO' || game.solo) ? 100 : 200;
        if (tricks === 0) { // Successful blind nil
          if (team1.includes(playerIndex)) {
            team1Score += blindNilValue;
            console.log(`[BLIND NIL SCORING] Player ${playerIndex} successful blind nil: +${blindNilValue} (${game.gameMode === 'SOLO' || game.solo ? 'solo' : 'partners'})`);
          } else {
            team2Score += blindNilValue;
            console.log(`[BLIND NIL SCORING] Player ${playerIndex} successful blind nil: +${blindNilValue} (${game.gameMode === 'SOLO' || game.solo ? 'solo' : 'partners'})`);
          }
        } else { // Failed blind nil
          if (team1.includes(playerIndex)) {
            team1Score -= blindNilValue;
            console.log(`[BLIND NIL SCORING] Player ${playerIndex} failed blind nil: -${blindNilValue} (${game.gameMode === 'SOLO' || game.solo ? 'solo' : 'partners'})`);
          } else {
            team2Score -= blindNilValue;
            console.log(`[BLIND NIL SCORING] Player ${playerIndex} failed blind nil: -${blindNilValue} (${game.gameMode === 'SOLO' || game.solo ? 'solo' : 'partners'})`);
          }
        }
      }    }
    
    // Calculate regular team scoring
    if (team1Tricks >= team1Bid) {
      team1Score += team1Bid * 10;
      team1Bags = team1Tricks - team1Bid;
      team1Score += team1Bags;
    } else {
      team1Score -= team1Bid * 10;
    }
    
    if (team2Tricks >= team2Bid) {
      team2Score += team2Bid * 10;
      team2Bags = team2Tricks - team2Bid;
      team2Score += team2Bags;
    } else {
      team2Score -= team2Bid * 10;
    }
    
    // Apply bag penalties to running totals
    let team1RunningTotal = (previousScore?.team1RunningTotal || 0) + team1Score;
    let team2RunningTotal = (previousScore?.team2RunningTotal || 0) + team2Score;
    let currentTeam1Bags = (previousScore?.team1Bags || 0) + team1Bags;
    let currentTeam2Bags = (previousScore?.team2Bags || 0) + team2Bags;
    
    // Apply bag penalties based on game mode
    if (game.gameMode === 'SOLO') {
      // Solo mode: reset bags at 5, penalty -50 points per player
      if (currentTeam1Bags >= 5) {
        team1RunningTotal -= 50;
        currentTeam1Bags -= 5;
        console.log(`[SOLO BAG PENALTY] Team 1 hit 5+ bags, applied -50 penalty. New score: ${team1RunningTotal}, New bags: ${currentTeam1Bags}`);
      }
      if (currentTeam2Bags >= 5) {
        team2RunningTotal -= 50;
        currentTeam2Bags -= 5;
        console.log(`[SOLO BAG PENALTY] Team 2 hit 5+ bags, applied -50 penalty. New score: ${team2RunningTotal}, New bags: ${currentTeam2Bags}`);
      }
    } else {
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
    
    console.log(`[DB SCORING] Game ${gameId} Round ${roundNumber} scores stored: Team 1: ${team1Score} (${team1RunningTotal}), Team 2: ${team2Score} (${team2RunningTotal})`);
    return gameScore;
  } catch (error) {
    console.error(`[DB SCORING ERROR] Failed to calculate and store game score for game ${gameId} round ${roundNumber}:`, error);
    throw error;
  }
}
