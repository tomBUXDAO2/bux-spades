import type { GameState } from '../../../types/game';

/** Formats where bids are predetermined; UI can keep hand face-down until all bids are in. */
export function isSequentialAutoBidFormat(gameState: GameState | null | undefined): boolean {
  if (!gameState) return false;
  const gs = gameState as unknown as Record<string, unknown>;
  const format = (gs.format || (gs.rules as Record<string, unknown>)?.bidType || (gs.rules as Record<string, unknown>)?.gameType) as string | undefined;
  const gv = (gs.gimmickVariant ||
    (gs.rules as Record<string, unknown>)?.gimmickType ||
    gs.forcedBid) as string | undefined;
  if (format === 'MIRROR') return true;
  if (gv === 'BID3' || gv === 'BID 3') return true;
  if (gv === 'BIDHEARTS' || gv === 'BID HEARTS') return true;
  if (gv === 'CRAZY ACES' || gv === 'CRAZY_ACES') return true;
  return false;
}

export function allBiddingSeatsHaveBids(gameState: GameState | null | undefined): boolean {
  if (!gameState) return false;
  const bids = (gameState as unknown as Record<string, unknown>)?.bidding as { bids?: unknown[] } | undefined;
  const arr = bids?.bids;
  if (!Array.isArray(arr) || arr.length < 4) return false;
  return arr.every((b) => b !== null && b !== undefined);
}
