import type { Game } from '../../../types/game';
import prisma from '../../prisma';
import { SafeOperations } from '../core/safeOperations';

/**
 * Safely save game state with crash protection
 */
export async function saveGameStateSafely(game: Game): Promise<void> {
  await SafeOperations.safeDbOperation(
    async () => {
      const gameState = {
        players: game.players.map(p => p ? {
          id: p.id,
          username: p.username,
          type: p.type,
          position: p.position,
          team: p.team,
          hand: p.hand,
          bid: p.bid,
          tricks: p.tricks,
          points: p.points,
          nil: p.nil,
          blindNil: p.blindNil,
          connected: p.connected
        } : null),
        currentRound: game.currentRound || 1,
        currentTrick: game.currentTrick || 1,
        currentPlayer: typeof game.currentPlayer === 'string' ? game.currentPlayer : (game.currentPlayer as any)?.id || null,
        dealer: game.dealer || 0,
        status: game.status,
        gameMode: game.gameMode,
        minPoints: game.minPoints,
        maxPoints: game.maxPoints,
        buyIn: game.buyIn,
        rules: game.rules,
        roundHistory: game.roundHistory || [],
        currentTrickCards: game.currentTrickCards || [],
        lastAction: game.lastAction,
        lastActionTime: game.lastActionTime,
        play: game.play,
        bidding: game.bidding,
        hands: game.hands,
        team1TotalScore: game.team1TotalScore,
        team2TotalScore: game.team2TotalScore,
        team1Bags: game.team1Bags,
        team2Bags: game.team2Bags,
        playerScores: game.playerScores,
        playerBags: game.playerBags,
        crashProtected: true,
        lastSaved: Date.now()
      };

      if (game.dbGameId) {
        await prisma.game.update({
          where: { id: game.dbGameId },
          data: { gameState: gameState as any }
        });
      }
    },
    () => {
      console.log(`[CRASH PREVENTION] Failed to save game state for ${game.id} - using fallback`);
      // Store in memory as fallback
      (game as any).crashProtectedState = {
        ...game,
        crashProtected: true,
        lastSaved: Date.now()
      };
    },
    `Save game state for ${game.id}`
  );
}

/**
 * Safely restore game state after crash
 */
export async function restoreGameStateSafely(game: Game): Promise<void> {
  await SafeOperations.safeDbOperation(
    async () => {
      if (game.dbGameId) {
        const dbGame = await prisma.game.findUnique({
          where: { id: game.dbGameId },
          select: { gameState: true }
        });
        
        if (dbGame && (dbGame as any).gameState) {
          const gameState = (dbGame as any).gameState;
          console.log(`[CRASH PREVENTION] Restoring game state for ${game.id}`);
          
          // Restore critical game state
          if (gameState.players) {
            game.players = gameState.players.map((p: any) => p ? {
              ...p,
              socket: null, // Will be reconnected
              lastAction: null,
              lastActionTime: null
            } : null);
          }
          
          if (gameState.status) game.status = gameState.status;
          if (gameState.currentPlayer) game.currentPlayer = gameState.currentPlayer;
          if (gameState.currentRound) game.currentRound = gameState.currentRound;
          if (gameState.currentTrick) game.currentTrick = gameState.currentTrick;
          if (gameState.play) game.play = gameState.play;
          if (gameState.bidding) game.bidding = gameState.bidding;
          if (gameState.playerScores) game.playerScores = gameState.playerScores;
          if (gameState.team1TotalScore) game.team1TotalScore = gameState.team1TotalScore;
          if (gameState.team2TotalScore) game.team2TotalScore = gameState.team2TotalScore;
        }
      }
    },
    () => {
      console.log(`[CRASH PREVENTION] Failed to restore game state for ${game.id} - using memory fallback`);
      // Use memory fallback if available
      if ((game as any).crashProtectedState) {
        const fallbackState = (game as any).crashProtectedState;
        Object.assign(game, fallbackState);
      }
    },
    `Restore game state for ${game.id}`
  );
}
