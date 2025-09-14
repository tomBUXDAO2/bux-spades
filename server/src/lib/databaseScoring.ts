import { v4 as uuidv4 } from 'uuid';
import prisma from './prisma';
import { games } from '../gamesStore';
import type { Game } from '../types/game';

// Update PlayerTrickCount after every trick
export async function updatePlayerTrickCount(gameId: string, roundNumber: number, playerId: string, tricksWon: number) {
  try {
    // Find the actual roundId from database
    const round = await prisma.round.findFirst({
      where: { gameId, roundNumber }
    });
    
    if (!round) {
      console.error(`[DB SCORING ERROR] Round ${roundNumber} not found for game ${gameId}`);
      return;
    }
    
    await prisma.playerTrickCount.upsert({
      where: {
        gameId_roundId_playerId: {
          gameId,
          roundId: round.id,
          playerId
        }
      },
      update: {
        tricksWon,
        lastUpdated: new Date()
      },
      create: {
        id: uuidv4(),
        gameId,
        roundId: round.id,
        playerId,
        tricksWon
      }
    });
    console.log(`[DB SCORING] Updated PlayerTrickCount: ${playerId} has ${tricksWon} tricks in round ${round.id}`);
  } catch (error) {
    console.error(`[DB SCORING ERROR] Failed to update PlayerTrickCount:`, error);
  }
}

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
    const game = games.find(g => g.id === gameId);
    if (!game) {
      console.error(`[DB SCORING ERROR] Game ${gameId} not found in memory`);
      return null;
    }
    
    // Calculate team bids and tricks
    for (const roundBid of round.RoundBid) {
      const playerIndex = game.players.findIndex(p => p?.id === roundBid.playerId);
      if (playerIndex === -1) continue;
      
      const trickCount = trickCounts.find(tc => tc.playerId === roundBid.playerId);
      const tricks = trickCount?.tricksWon || 0;
      
      if (team1.includes(playerIndex)) {
        team1Tricks += tricks;
        if (roundBid.bid > 0) { // Regular bid (not nil/blind nil)
          team1Bid += roundBid.bid;
        }
      } else if (team2.includes(playerIndex)) {
        team2Tricks += tricks;
        if (roundBid.bid > 0) { // Regular bid (not nil/blind nil)
          team2Bid += roundBid.bid;
        }
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
        if (tricks === 0) { // Successful nil
          if (team1.includes(playerIndex)) {
            team1Score += 100;
          } else {
            team2Score += 100;
          }
        } else { // Failed nil
          if (team1.includes(playerIndex)) {
            team1Score -= 100;
          } else {
            team2Score -= 100;
          }
        }
      } else if (roundBid.isBlindNil) { // Blind nil
        if (tricks === 0) { // Successful blind nil
          if (team1.includes(playerIndex)) {
            team1Score += 200;
          } else {
            team2Score += 200;
          }
        } else { // Failed blind nil
          if (team1.includes(playerIndex)) {
            team1Score -= 200;
          } else {
            team2Score -= 200;
          }
        }
      }
    }
    
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
    
    if (currentTeam1Bags >= 10) {
      team1RunningTotal -= 100;
      currentTeam1Bags -= 10;
    }
    if (currentTeam2Bags >= 10) {
      team2RunningTotal -= 100;
      currentTeam2Bags -= 10;
    }
    
    const gameScore = await prisma.gameScore.create({
      data: {
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

// Check if game is complete based on running totals
export async function checkGameCompletion(gameId: string, maxPoints: number, minPoints: number) {
  try {
    const latestScore = await prisma.gameScore.findFirst({
      where: { gameId },
      orderBy: { roundNumber: 'desc' }
    });
    
    if (!latestScore) {
      return { isGameOver: false, winningTeam: null };
    }
    
    const team1Total = latestScore.team1RunningTotal;
    const team2Total = latestScore.team2RunningTotal;
    
    let isGameOver = false;
    let winningTeam: 1 | 2 | null = null;
    
    if (team1Total >= maxPoints && team1Total > team2Total) {
      isGameOver = true;
      winningTeam = 1;
    } else if (team2Total >= maxPoints && team2Total > team1Total) {
      isGameOver = true;
      winningTeam = 2;
    } else if (team1Total <= minPoints) {
      isGameOver = true;
      winningTeam = 2; // Team 1 lost, so Team 2 wins
    } else if (team2Total <= minPoints) {
      isGameOver = true;
      winningTeam = 1; // Team 2 lost, so Team 1 wins
    }
    
    return { isGameOver, winningTeam };
  } catch (error) {
    console.error(`[DB GAME COMPLETION ERROR] Failed to check game completion for game ${gameId}:`, error);
    throw error;
  }
}
