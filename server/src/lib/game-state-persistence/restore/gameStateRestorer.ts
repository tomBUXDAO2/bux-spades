import prisma from '../../prisma';
import type { Game } from '../../../types/game';

/**
 * Restore game state from database
 */
export async function restoreGameState(gameId: string): Promise<Game | null> {
  try {
    const dbGame = await (prisma.game.findUnique as any)({
      where: { id: gameId },
      include: {
        GamePlayer: true,
        Round: {
          include: {
            Trick: {
              orderBy: { trickNumber: 'asc' }
            }
          },
          orderBy: { roundNumber: 'asc' }
        }
      }
    });

    if (!dbGame || !(dbGame as any).gameState) {
      console.log(`[GAME STATE] ❌ No saved state found for game ${gameId}`);
      return null;
    }

    const gameState = (dbGame as any).gameState as any;
    
    // Reconstruct the game object with COMPLETE state
    const game: Game = {
      id: dbGame.id,
      players: gameState.players.map((p: any) => p ? {
        ...p,
        socket: null, // Will be reconnected when players join
        lastAction: null,
        lastActionTime: null
      } : null),
      currentRound: gameState.currentRound || 1,
      currentTrick: gameState.currentTrick || 1,
      currentPlayer: gameState.players.find((p: any) => p?.id === gameState.currentPlayer) || null,
      dealer: gameState.dealer || 0,
      status: gameState.status,
      gameMode: gameState.gameMode,
      minPoints: gameState.minPoints,
      maxPoints: gameState.maxPoints,
      buyIn: gameState.buyIn,
      rules: gameState.rules,
      roundHistory: gameState.roundHistory || [],
      currentTrickCards: gameState.currentTrickCards || [],
      lastAction: gameState.lastAction,
      lastActionTime: gameState.lastActionTime,
      play: gameState.play,
      bidding: gameState.bidding,
      hands: gameState.hands,
      team1TotalScore: gameState.team1TotalScore,
      team2TotalScore: gameState.team2TotalScore,
      team1Bags: gameState.team1Bags,
      team2Bags: gameState.team2Bags,
      playerScores: gameState.playerScores,
      playerBags: gameState.playerBags,
      createdAt: dbGame.createdAt.getTime(),
      updatedAt: dbGame.updatedAt.getTime(),
      // Restore additional state - these are runtime properties, not database fields
      // deck: gameState.deck || [],
      // playedCards: gameState.playedCards || [],
      // trickHistory: gameState.trickHistory || [],
      // roundScores: gameState.roundScores || [],
      // Add missing properties with defaults
      forcedBid: undefined as any,
      specialRules: { screamer: false, assassin: false },
      spectators: [],
      completedTricks: [],
      isBotGame: false
    };

    console.log(`[GAME STATE] ✅ Restored COMPLETE game ${gameId} - Round ${game.currentRound}, Trick ${game.currentTrick}`);
    console.log(`[GAME STATE] 📊 Restored: ${game.players.filter(p => p?.hand?.length).length} player hands, ${gameState.roundHistory.length} rounds, ${gameState.trickHistory.length} tricks`);
    return game;
  } catch (error) {
    console.error(`[GAME STATE] ❌ Failed to restore game ${gameId}:`, error);
    return null;
  }
}
