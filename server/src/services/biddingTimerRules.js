/**
 * Pure rules for when bidding turn timers apply (shared by BiddingHandler and humanTurnScheduler).
 */

export function isSuicideBidForced(gameState) {
  try {
    const currentPlayerIndex = gameState.players.findIndex((p) => p.userId === gameState.currentPlayer);
    if (currentPlayerIndex === -1) {
      return false;
    }
    const partnerIndex = (currentPlayerIndex + 2) % 4;
    const bids = gameState.bidding?.bids || [];
    const partnerBid = bids[partnerIndex];
    if (partnerBid === undefined || partnerBid === null) {
      return false;
    }
    if (partnerBid === 0) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function shouldApplyBiddingTimer(gameState) {
  const format = gameState.format;
  const gimmickVariant = gameState.gimmickVariant;
  const alwaysForcedFormats = ['MIRROR', 'BID3', 'BIDHEARTS', 'CRAZY_ACES'];

  if (alwaysForcedFormats.includes(format) || alwaysForcedFormats.includes(gimmickVariant)) {
    return false;
  }

  if (gimmickVariant === 'SUICIDE') {
    return !isSuicideBidForced(gameState);
  }

  return true;
}
