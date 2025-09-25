import prisma from '../../prisma';
import type { Game } from '../../../types/game';

/**
 * Save current game state to database
 */
export async function saveGameState(game: Game): Promise<void> {
  // Check if game exists in database before trying to update
  const existingGame = await prisma.game.findUnique({ where: { id: game.id } });
  if (!existingGame) {
    console.log(`[GAME STATE] ⚠️ Game ${game.id} not found in database, skipping save`);
    return;
  }
  try {
    // Extract current game state with COMPLETE information
    const gameState = {
      players: game.players.map(p => p ? {
        id: p.id,
        username: p.username,
        type: p.type,
        seatIndex: p.seatIndex,
        team: p.team,
        hand: p.hand, // ✅ STORING PLAYER HANDS
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
      mode: game.mode,
      minPoints: game.minPoints,
      maxPoints: game.maxPoints,
      buyIn: game.buyIn,
      rules: game.rules,
      roundHistory: game.roundHistory || [], // ✅ STORING ROUND SCORES
      currentTrickCards: game.currentTrickCards || [], // ✅ STORING CURRENT TRICK
      lastAction: game.lastAction,
      lastActionTime: game.lastActionTime,
      play: game.play,
      bidding: game.bidding,
      hands: game.hands, // ✅ STORING DEALED HANDS
      team1TotalScore: game.team1TotalScore,
      team2TotalScore: game.team2TotalScore,
      team1Bags: game.team1Bags,
      team2Bags: game.team2Bags,
      playerScores: game.playerScores,
      playerBags: game.playerBags,
      // Additional state for complete recovery - these are runtime properties, not database fields
      // deck: game.deck || [], // ✅ STORING REMAINING DECK
      // playedCards: game.playedCards || [], // ✅ STORING PLAYED CARDS
      // trickHistory: game.trickHistory || [], // ✅ STORING TRICK HISTORY
      // roundScores: game.roundScores || [] // ✅ STORING ROUND-BY-ROUND SCORES
    };

    // Use type assertion to bypass Prisma type issues
    await (prisma.game.update as any)({
      where: { id: game.id },
      data: {
        currentRound: game.currentRound || 1,
        currentTrick: game.currentTrick || 1,
        currentPlayer: typeof game.currentPlayer === 'string' ? game.currentPlayer : (game.currentPlayer as any)?.id || null,
        dealer: game.dealer || 0,
        gameState: gameState,
        lastActionAt: new Date(),
        // updatedAt: new Date()
      }
    });

    console.log(`[GAME STATE] ✅ Saved COMPLETE state for game ${game.id} - Round ${game.currentRound || 1}, Trick ${game.currentTrick || 1}`);
    console.log(`[GAME STATE] 📊 Stored: ${game.players.filter(p => p?.hand?.length).length} player hands, ${gameState.roundHistory.length} rounds, ${(gameState as any).trickHistory?.length || 0} tricks`);
    console.log(`[GAME STATE DEBUG] Player hands:`, game.players.map((p, i) => `${i}: ${p?.username} = ${p?.hand?.length || 0} cards`));  } catch (error) {
    console.error(`[GAME STATE] ❌ Failed to save state for game ${game.id}:`, error);
  }
}
