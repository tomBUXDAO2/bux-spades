import type { Game } from '../types/game';

/**
 * Game state validator to prevent inconsistent states
 */
export class GameValidator {
  /**
   * Validate and fix game state
   */
  public static validateGame(game: Game): { isValid: boolean; fixes: string[] } {
    const fixes: string[] = [];
    let isValid = true;

    // Check for invalid status transitions
    if (game.status === 'FINISHED' && game.players.some(p => p && p.type === 'human')) {
      // Game is marked finished but has human players - this is a stuck state
      fixes.push('Game marked FINISHED but has human players - marking as WAITING');
      game.status = 'WAITING';
      isValid = false;
    }

    // Check for games with no players
    const activePlayers = game.players.filter(p => p !== null);
    if (activePlayers.length === 0 && game.status !== 'FINISHED') {
      fixes.push('Game has no players - marking as FINISHED');
      game.status = 'FINISHED';
      isValid = false;
    }

    // Check for games stuck in PLAYING with no current player
    if (game.status === 'PLAYING' && !game.currentPlayer) {
      fixes.push('Game in PLAYING state but no current player - setting to first active player');
      const firstPlayer = game.players.find(p => p !== null);
      if (firstPlayer) {
        game.currentPlayer = firstPlayer.id;
      } else {
        game.status = 'FINISHED';
        fixes.push('No active players found - marking as FINISHED');
      }
      isValid = false;
    }

    // Check for games stuck in BIDDING with no current player
    if (game.status === 'BIDDING' && !game.bidding?.currentPlayer) {
      fixes.push('Game in BIDDING state but no current bidder - setting to first active player');
      const firstPlayer = game.players.find(p => p !== null);
      if (firstPlayer) {
        if (!game.bidding) game.bidding = { currentPlayer: "0", currentBidderIndex: 0, nilBids: {}, bids: [null, null, null, null] };
        game.bidding.currentPlayer = String(firstPlayer.seatIndex || 0);
      } else {
        game.status = 'FINISHED';
        fixes.push('No active players found - marking as FINISHED');
      }
      isValid = false;
    }

    // Check for invalid player positions
    game.players.forEach((player, index) => {
      if (player && player.seatIndex !== index) {
        fixes.push(`Player ${player.username} has wrong position - fixing`);
        player.seatIndex = index;
        isValid = false;
      }
    });

    return { isValid, fixes };
  }

  /**
   * Validate all games in the system
   */
  public static validateAllGames(games: Game[]): { validGames: Game[]; invalidGames: Game[] } {
    const validGames: Game[] = [];
    const invalidGames: Game[] = [];

    games.forEach(game => {
      const validation = this.validateGame(game);
      if (validation.isValid) {
        validGames.push(game);
      } else {
        console.log(`[GAME VALIDATOR] Fixed game ${game.id}:`, validation.fixes);
        invalidGames.push(game);
        validGames.push(game); // Add it back after fixes
      }
    });

    return { validGames, invalidGames };
  }

  /**
   * Check if a game should be removed from lobby
   */
  public static shouldRemoveFromLobby(game: Game): boolean {
    // Remove finished games
    if (game.status === 'FINISHED') {
      return true;
    }

    // Remove games with no human players (unless league)
    const hasHumanPlayers = game.players.some(p => p && p.type === 'human');
    if (!hasHumanPlayers && !(game as any).league) {
      return true;
    }

    // Remove games that have been waiting too long with no activity
    const lastActivity = (game as any).lastActivity || 0;
    const now = Date.now();
    if (game.status === 'WAITING' && now - lastActivity > 300000) { // 5 minutes
      return true;
    }

    return false;
  }
}
