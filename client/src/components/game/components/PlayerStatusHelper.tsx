import type { GameState, Player, Bot } from "../../types/game"""';

interface PlayerStatusProps {
  gameState: GameState;
  player: Player | Bot | null;
  position: number;
  currentPlayerId: string | null;
  countdownPlayer: {playerId: string, playerIndex: number, timeLeft: number} | null;
  isPlayer: (player: any) => player is Player;
  isBot: (player: any) => player is Bot;
}

export const getPlayerStatus = ({
  gameState,
  player,
  position,
  currentPlayerId,
  countdownPlayer,
  isPlayer,
  isBot
}: PlayerStatusProps) => {
  if (!player) {
    return {
      isActive: false,
      isCurrentPlayer: false,
      isOnCountdown: false,
      shouldShowTimer: false,
      isHuman: false,
      isBot: false,
      canRemove: false,
      canInvite: true
    };
  }

  const isHuman = isPlayer(player);
  const isBotPlayer = isBot(player);
  const isActive = player.id === currentPlayerId;
  const isCurrentPlayer = player && player.id === gameState.currentPlayer;
  const isOnCountdown = !!countdownPlayer && countdownPlayer.playerId === player.id;
  const shouldShowTimer = Boolean(isOnCountdown && isCurrentPlayer && (countdownPlayer?.timeLeft ?? 0) > 0);

  // Check if player can be removed
  const canRemovePlayer = (() => {
    if (!isHuman || !player.id) return false;
    
    const originalPosition = player.seatIndex;
    const isPartnerGame = ((gameState as any).gameMode || (gameState as any).rules?.gameType) === 'PARTNERS';
    
    if (isPartnerGame) {
      // In partners mode, check if removing this player would leave their partner alone
      const partnerOriginalPosition = (originalPosition + 2) % 4;
      const partner = gameState.players.find(p => p && p.seatIndex === partnerOriginalPosition);
      
      if (partner && isPlayer(partner)) {
        // Partner exists and is human, can remove
        return true;
      } else if (!partner) {
        // No partner, can remove
        return true;
      } else {
        // Partner is bot, can remove
        return true;
      }
    } else {
      // Solo mode, can always remove
      return true;
    }
  })();

  const canInviteBot = gameState.status === 'WAITING' && !player;

  return {
    isActive,
    isCurrentPlayer,
    isOnCountdown,
    shouldShowTimer,
    isHuman,
    isBot: isBotPlayer,
    canRemove: canRemovePlayer,
    canInvite: canInviteBot
  };
};

export const getPlayerBidInfo = (gameState: GameState, player: Player | Bot | null, position: number) => {
  if (!player) return null;

  const actualSeatIndex = player.seatIndex;
  const rawBid = (gameState as any).bidding?.bids?.[actualSeatIndex];
  const tricksLeft = gameState.status === 'PLAYING' ? 13 - ((gameState as any).play?.tricks?.length || 0) : 13;
  
  const formatBid = (bid: number | null) => {
    if (bid === null || bid === undefined) return '?';
    if (bid === 0) return 'Nil';
    if (bid === -1) return 'Blind Nil';
    return bid.toString();
  };

  const isPartnerGame = ((gameState as any).gameMode || (gameState as any).rules?.gameType) === 'PARTNERS';
  
  if (isPartnerGame) {
    const partnerPosition = (position + 2) % 4;
    const partnerBid = (gameState as any).bidding?.bids?.[partnerPosition] ?? 0;
    const totalBid = (rawBid ?? 0) + partnerBid;
    
    return {
      rawBid,
      formattedBid: formatBid(rawBid),
      totalBid,
      tricksLeft,
      isPartnerGame: true
    };
  }

  return {
    rawBid,
    formattedBid: formatBid(rawBid),
    tricksLeft,
    isPartnerGame: false
  };
};
