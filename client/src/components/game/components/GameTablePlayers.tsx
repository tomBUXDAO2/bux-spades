import React, { type RefObject } from 'react';
import { FaRobot, FaMinus } from 'react-icons/fa';
import type { GameState, Player, Bot } from "../../../types/game";
import PlayerProfileDropdown from './PlayerProfileDropdown';
import EmojiReaction from './EmojiReaction';
import CoinDebitAnimation from './CoinDebitAnimation';
import { abbreviateBotName } from '../../../utils/botUtils';
import { getTricksRemainingInHand } from '../../../features/game/utils/gameUtils';

interface GameTablePlayersProps {
  gameState: GameState;
  user: any;
  orderedPlayers: (Player | Bot | null)[]; // Updated to support Bot type
  sanitizedPlayers: (Player | Bot | null)[];
  currentPlayerId: string | null;
  myPlayerIndex: number;
  countdownPlayer: {playerId: string, playerIndex: number, timeLeft: number} | null;
  isVerySmallScreen: boolean;
  isMobile: boolean;
  windowSize: { width: number; height: number };
  scaleFactor: number;
  invitingBotSeat: number | null;
  joinGame: (gameId: string, userId: string, options?: any) => void;
  handleInviteBot: (position: number) => void;
  handleRemoveBot: (position: number) => void;
  handleViewPlayerStats: (player: Player) => void;
  handleEmojiReaction: (playerId: string, emoji: string) => void;
  handleEmojiComplete: (playerId: string) => void;
  handleSendEmoji: (targetPlayerId: string, emoji: string) => void;
  emojiReactions: Record<string, { emoji: string; timestamp: number }>;
  showCoinDebit: boolean;
  pendingBid?: { playerId: string; bid: number } | null;
  coinDebitAmount: number;
  recentChatMessages: Record<string, { message: string; timestamp: number }>;
  isPlayer: (player: any) => player is Player;
  isBot: (player: any) => player is Bot;
  onOpenAdminPanel?: () => void;
  /** Clear AWAY server-side (current user only) */
  onImBack?: () => void;
  /** Spectator requesting to replace bot / away player */
  isSpectating?: boolean;
  onRequestSubSeat?: (seatIndex: number) => void;
  /** Refs on screen-north (position 2) / south (position 0) wrappers for trick-card layout measurement */
  northPlayerSlotRef?: RefObject<HTMLDivElement>;
  southPlayerSlotRef?: RefObject<HTMLDivElement>;
}

export default function GameTablePlayers({
  gameState,
  user,
  orderedPlayers,
  sanitizedPlayers,
  currentPlayerId,
  myPlayerIndex,
  countdownPlayer,
  isVerySmallScreen,
  isMobile,
  windowSize,
  scaleFactor,
  invitingBotSeat,
  joinGame,
  handleInviteBot,
  handleRemoveBot,
  handleViewPlayerStats,
  handleEmojiReaction,
  handleEmojiComplete,
  handleSendEmoji,
  emojiReactions,
  showCoinDebit,
  coinDebitAmount,
  recentChatMessages,
  isPlayer,
  isBot,
  pendingBid,
  onOpenAdminPanel,
  onImBack,
  isSpectating = false,
  onRequestSubSeat,
  northPlayerSlotRef,
  southPlayerSlotRef,
}: GameTablePlayersProps) {
  
  const renderPlayerPosition = (position: number) => {
    const player = orderedPlayers[position];
    
              // Check if this specific player is on timer - only show overlay for current player who is timing out
      // @ts-ignore
      const currentPlayerIndex = gameState.bidding?.currentBidderIndex || gameState.play?.currentPlayerIndex || 0;

      // Check if this player is on countdown overlay
      const isPlayerOnCountdown = !!countdownPlayer && countdownPlayer.playerId === player?.id;
      
      // Check if this specific player is the current player (timing out)
      const isCurrentPlayer = player && player.id === gameState.currentPlayer;
      // Only show overlay when it's the current player's turn AND their countdown has fully elapsed
      const shouldShowTimerOnPlayer = Boolean(isPlayerOnCountdown && isCurrentPlayer && (countdownPlayer?.timeLeft ?? 0) > 0);
    

    
    // Define getPositionClasses FIRST
    const getPositionClasses = (pos: number): string => {
      // Base positioning - moved to edge of table
      const basePositions = [
        'bottom-0 left-1/2 -translate-x-1/2',  // South (bottom)
        'left-0 top-1/2 -translate-y-1/2',     // West (left)
        'top-0 left-1/2 -translate-x-1/2',     // North (top)
        'right-0 top-1/2 -translate-y-1/2'     // East (right)
      ];
      
      // Mobile: inset west/east so name + bid clear camera punch-holes
      if (windowSize.width < 768) {
        const mobilePositions = [
          'bottom-0 left-1/2 -translate-x-1/2',  // South
          'left-2 top-1/2 -translate-y-1/2',     // West
          'top-0 left-1/2 -translate-x-1/2',     // North
          'right-2 top-1/2 -translate-y-1/2'     // East
        ];
        return mobilePositions[pos];
      }
      
      return basePositions[pos];
    };

    // If seat is empty and user is not in game, show join button (including spectators)
    if (!player && myPlayerIndex === -1) {
      return (
        <div className={`absolute ${getPositionClasses(position)} z-10`}>
          <button
            className={`${isVerySmallScreen ? 'w-12 h-12' : 'w-16 h-16'} rounded-full bg-slate-600 border border-slate-300 text-slate-200 flex items-center justify-center hover:bg-slate-500 transition`}
            style={{ fontSize: isVerySmallScreen ? '10px' : '16px' }}
            onClick={async () => {
              // Use REST API to join specific seat
              console.log(`[JOIN SEAT] Attempting to join seat ${position} in game ${gameState.id}`);
              try {
                const { api } = await import('../../../services/lib/api');
                console.log(`[JOIN SEAT] API imported, making request...`);
                const res = await api.post(`/api/games/${gameState.id}/join`, {
                  id: user.id,
                  username: user.username,
                  avatar: user.avatar || user.avatarUrl,
                  seat: position
                });
                console.log(`[JOIN SEAT] Response status:`, res.status);
                if (!res.ok) {
                  const error = await res.json();
                  console.error('[JOIN SEAT] Failed to join seat:', error);
                  alert('Failed to join seat: ' + (error.error || 'Unknown error'));
                } else {
                  const data = await res.json();
                  console.log(`[JOIN SEAT] ✅ Successfully joined seat ${position}`, data);
                  // Remove spectate param from URL and reload to update isSpectator state
                  const url = new URL(window.location.href);
                  url.searchParams.delete('spectate');
                  console.log(`[JOIN SEAT] Reloading page without spectate param`);
                  window.location.href = url.toString();
                }
              } catch (err) {
                console.error('[JOIN SEAT] Error joining seat:', err);
                alert('Failed to join seat: ' + err);
              }
            }}
          >
            JOIN
          </button>
        </div>
      );
    }
    // If seat is empty and game is WAITING, show Invite Bot button
    if (!player && gameState.status === 'WAITING') {
      console.log(`[INVITE BOT DEBUG] Rendering Invite Bot button for seat ${position}, gameStatus: ${gameState.status}`);
      return (
        <div className={`absolute ${getPositionClasses(position)} z-10`}>
          <button
            className={`${isVerySmallScreen ? 'w-12 h-12' : 'w-16 h-16'} rounded-full bg-gray-600 border border-slate-300 text-white flex flex-col items-center justify-center hover:bg-gray-500 transition disabled:opacity-50 p-0 py-1`}
            onClick={() => handleInviteBot(position)}
            disabled={invitingBotSeat === position}
            style={{ fontSize: isVerySmallScreen ? '8px' : '10px', lineHeight: 1.1 }}
          >
            <span className={`${isVerySmallScreen ? 'text-[8px]' : 'text-[10px]'} leading-tight mb-0`}>Invite</span>
            <span className="flex items-center justify-center my-0">
              <span className={`${isVerySmallScreen ? 'text-sm' : 'text-lg'} font-bold mr-0.5`}>+</span>
              <FaRobot className={isVerySmallScreen ? "w-3 h-3" : "w-4 h-4"} />
            </span>
            <span className={`${isVerySmallScreen ? 'text-[8px]' : 'text-[10px]'} leading-tight mt-0`}>{invitingBotSeat === position ? '...' : 'Bot'}</span>
          </button>
        </div>
      );
    }
    // If seat is empty and user cannot invite a bot, show nothing
    if (!player) return null;

    // Shared variables for both bots and humans
    const isActive = gameState.status !== "WAITING" && gameState.currentPlayer === player.id;
    const isSideSeat = position === 1 || position === 3;
    // Made/bid chip drives component width (E/W) and avatar square size (all seats)
    const bidChipWidth = isVerySmallScreen ? 52 : isMobile ? 68 : 88;
    const bidChipHeight = isVerySmallScreen ? 22 : isMobile ? 26 : 30;
    const avatarSize = bidChipWidth;
    const nameFontSize = isVerySmallScreen ? 9 : isMobile ? 11 : 13;
    const bidFontSize = isVerySmallScreen ? 11 : isMobile ? 13 : 15;
    const statusFontSize = isVerySmallScreen ? 12 : isMobile ? 14 : 16;
    
    // Determine game mode early for color selection
    // rules.gameType is often the bidding format (REGULAR/MIRROR/…), not PARTNERS —
    // so treat anything that isn't SOLO as partners for badge logic.
    const modeToken = String(
      (gameState as any).gameMode ||
        (gameState as any).mode ||
        ((gameState as any).rules?.gameType === 'SOLO' ? 'SOLO' : '') ||
        ''
    ).toUpperCase();
    const isSoloGame = modeToken === 'SOLO';
    const isPartnerGame = !isSoloGame;
    
    // Seat/team colour: body fill + matching avatar border
    const originalPosition = player.seatIndex ?? position;
    let playerGradient: string;
    if (isSoloGame) {
      const soloFills = [
        'bg-gradient-to-r from-red-700 to-red-500',
        'bg-gradient-to-r from-blue-700 to-blue-500',
        'bg-gradient-to-r from-orange-600 to-orange-400',
        'bg-gradient-to-r from-green-700 to-green-500'
      ];
      playerGradient = soloFills[originalPosition] || soloFills[0];
    } else {
      const isRedTeam = originalPosition === 0 || originalPosition === 2;
      playerGradient = isRedTeam
        ? 'bg-gradient-to-r from-red-700 to-red-500'
        : 'bg-gradient-to-r from-blue-700 to-blue-500';
    }
    // Shared padding for the username/bid panel (same on all seats)
    const textPanelPad = isVerySmallScreen ? 'px-1 py-1.5' : 'px-1.5 py-2';
    const nameToBidGap = isVerySmallScreen ? 'mt-2' : 'mt-2.5';
    // Calculate bid/made/tick/cross logic for both bots and humans
    const madeCount = player.tricks || 0;
    // Use the player's actual seatIndex to get the bid from the server
    // The server's bidding.bids array is indexed by seatIndex (0,1,2,3)
    const actualSeatIndex = player.seatIndex;
    const bidsArr = (gameState as any).bidding?.bids;
    let rawBid =
      actualSeatIndex !== null && actualSeatIndex !== undefined
        ? bidsArr?.[actualSeatIndex]
        : undefined;
    // Fallback to player.bid when bids array slot is missing
    if (rawBid === null || rawBid === undefined) {
      rawBid = (player as any).bid;
    }
    const isBlindNil = (gameState as any).players?.[actualSeatIndex]?.isBlindNil || player.isBlindNil || false;
    
    // OPTIMISTIC UI: Show pending bid immediately
    if (pendingBid && pendingBid.playerId === player.id) {
      rawBid = pendingBid.bid;
      console.log('[OPTIMISTIC BID] Displaying pending bid for player:', player.id, 'bid:', pendingBid.bid);
    }
    
    
    const hasBid = rawBid !== null && rawBid !== undefined;
    const bidCount = hasBid ? Number(rawBid) : 0;
    // Nil / blind nil: never inherit partner contract tick mid-hand
    const isNilSeat =
      hasBid && (isBlindNil || bidCount === 0 || bidCount === -1 || Number(rawBid) === -1);
    
    let madeStatus: string | null = null;
    const tricksLeft = getTricksRemainingInHand(gameState);
    const formatBid = (bid: number | null, isBlindNil: boolean = false) => {
      if (bid === null || bid === undefined) return "0";
      if (bid === -1) return "bn";
      if (bid === 0 && isBlindNil) return "bn";
      if (bid === 0) return "n";
      return bid.toString();
    };
    
    if (isNilSeat) {
      // Absolute rule (solo + partners): nil only shows ❌ after taking a trick.
      // Never ✅ mid-hand — nil success is only known after all 13 tricks.
      madeStatus = madeCount > 0 ? '❌' : null;
    } else if (isPartnerGame) {
      // Non-nil partners seat: team contract tick/cross on this player only
      const partnerPosition = (actualSeatIndex + 2) % 4;
      const partner = gameState.players[partnerPosition];
      const partnerRawBid = (gameState as any).bidding?.bids?.[partnerPosition];
      const partnerMade = partner && partner.tricks ? partner.tricks : 0;

      const contribTeamBid = (b: unknown) => {
        if (b === null || b === undefined) return 0;
        const n = Number(b);
        if (!Number.isFinite(n) || n < 0) return 0;
        return n;
      };

      const teamBid = contribTeamBid(rawBid) + contribTeamBid(partnerRawBid);
      const teamMade = madeCount + partnerMade;
      const teamMadeContract = teamBid > 0 && teamMade >= teamBid;
      const teamCannotMakeContract = teamBid > 0 && teamMade + tricksLeft < teamBid;

      if (hasBid && bidCount > 0) {
        if (teamCannotMakeContract) {
          madeStatus = '❌';
        } else if (teamMadeContract) {
          madeStatus = '✅';
        }
      }
    } else if (isSoloGame) {
      // Solo non-nil
      if (bidCount > 0) {
        if (madeCount >= bidCount) {
          madeStatus = '✅';
        } else if (madeCount + tricksLeft < bidCount) {
          madeStatus = '❌';
        }
      }
    }

    // Final guard: nil seats must never show a tick
    if (isNilSeat && madeStatus === '✅') {
      madeStatus = null;
    }
    
    // --- END NEW LOGIC ---

    // Check if this is a league game
    const isLeagueGame = (gameState as any).league;
    
    // Check if there are spectators available to fill seats
    const spectators = (gameState as any).spectators || [];
    const hasAvailableSpectators = spectators.length > 0;
    // After rendering the player avatar/info, render the played card if any
    // const playedCard = player ? getPlayedCardForPlayer(player.id) : null;
    const isHuman = isPlayer(player);
    
    // Permission to remove player/bot based on game type and state
    const canRemovePlayer = (() => {
      if (!currentPlayerId) return false;
      
      // Never allow removing yourself
      if (player.id === currentPlayerId) {
        return false;
      }
      
      // League games: Never allow removing players
      if (isLeagueGame) {
        return false;
      }
      
      // Non-league games
      if (gameState.status === 'WAITING') {
        // Before game starts
        if (isHuman) {
          // Host can remove any player (except themselves)
          if (sanitizedPlayers[0]?.id === currentPlayerId) {
            return true;
          }
          // Human players can remove their partner if partner is a bot
          const originalPosition = player.seatIndex ?? position;
          const partnerOriginalPosition = (originalPosition + 2) % 4;
          const partner = gameState.players.find(p => p && p.seatIndex === partnerOriginalPosition);
          return partner?.id === currentPlayerId && !isHuman; // Only if partner is bot
      } else {
          // Host can remove any bot
          if (sanitizedPlayers[0]?.id === currentPlayerId) {
            return true;
          }
          // Human players can remove their partner bot
        const originalPosition = player.seatIndex ?? position;
        const partnerOriginalPosition = (originalPosition + 2) % 4;
        const partner = gameState.players.find(p => p && p.seatIndex === partnerOriginalPosition);
        return partner?.id === currentPlayerId;
        }
      } else {
        // After game starts
        if (isHuman) {
          // Human players cannot be removed after game starts
          return false;
        } else {
          // Bots can be removed by their partner ONLY if spectators are available
          const originalPosition = player.seatIndex ?? position;
          const partnerOriginalPosition = (originalPosition + 2) % 4;
          const partner = gameState.players.find(p => p && p.seatIndex === partnerOriginalPosition);
          return partner?.id === currentPlayerId && hasAvailableSpectators;
        }
      }
    })();
    
    const displayName = isHuman ? player.username : abbreviateBotName(player.username);
    const displayAvatar = isHuman ? player.avatarUrl : '/bot-avatar.jpg';
    const isAway = isHuman && Boolean((player as Player).isAway);
    
    // Debug avatar loading
    if (isHuman && player.id === user?.id) {
    }
    const seatRef =
      position === 2 ? northPlayerSlotRef : position === 0 ? southPlayerSlotRef : undefined;

    const avatarFrame = (
      <div
        className={`relative h-full w-full overflow-hidden rounded-md border-[3px] border-black/25 bg-slate-900`}
        data-player-id={player.id}
      >
        <img
          src={displayAvatar}
          alt={displayName}
          width={avatarSize}
          height={avatarSize}
          className={`h-full w-full object-cover ${isHuman && isAway ? 'opacity-45' : ''}`}
        />
        {isHuman && isAway && (
          <div
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/50 ring-2 ring-inset ring-amber-500/60"
            aria-label="Away"
          >
            <span
              className="font-black uppercase tracking-tight text-amber-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
              style={{
                fontSize: Math.max(8, avatarSize * 0.18),
                lineHeight: 1,
              }}
            >
              AWAY
            </span>
          </div>
        )}
        {isHuman && emojiReactions[player.id] && (
          <EmojiReaction
            emoji={emojiReactions[player.id].emoji}
            onComplete={() => handleEmojiComplete(player.id)}
          />
        )}
        {canRemovePlayer && (
          <div className="absolute -bottom-1.5 -left-1.5 z-50">
            <button
              className={`remove-player-button ${isVerySmallScreen ? 'w-3 h-3' : 'w-4 h-4'} bg-red-600 text-white rounded-full flex items-center justify-center text-xs border border-white shadow hover:bg-red-700 transition`}
              style={{ minWidth: 'unset !important', minHeight: 'unset !important', padding: '0 !important' }}
              title={isHuman ? "Remove Player" : "Remove Bot"}
              onClick={() => handleRemoveBot(position)}
            >
              <FaMinus className={isVerySmallScreen ? "w-2 h-2" : "w-2.5 h-2.5"} />
            </button>
          </div>
        )}
        {player.isDealer && (
          <div className="absolute -bottom-1 -right-1">
            <div className={`flex items-center justify-center ${isVerySmallScreen ? 'w-4 h-4' : 'w-5 h-5'} rounded-full bg-gradient-to-r from-yellow-300 to-yellow-500 shadow-md`}>
              <div className={`${isVerySmallScreen ? 'w-3 h-3' : 'w-4 h-4'} rounded-full bg-yellow-600 flex items-center justify-center`}>
                <span className={`${isVerySmallScreen ? 'text-[6px]' : 'text-[8px]'} font-bold text-yellow-200`}>D</span>
              </div>
            </div>
          </div>
        )}
        {shouldShowTimerOnPlayer && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-500 bg-opacity-80">
            <span className="text-lg font-bold text-white">{countdownPlayer?.timeLeft || 0}</span>
          </div>
        )}
        {Boolean(isPlayerOnCountdown && isCurrentPlayer && (countdownPlayer?.timeLeft ?? 0) > 0) && (
          <div className="absolute inset-0 flex items-center justify-center bg-orange-500 bg-opacity-80">
            <span className="text-lg font-bold text-white">{countdownPlayer?.timeLeft ?? 0}</span>
          </div>
        )}
      </div>
    );

    // Avatar inset inside the coloured shell (same on every seat)
    const avatarInset = isVerySmallScreen ? 3 : 4;
    const avatarInner = avatarSize - avatarInset * 2;

    return (
      <div ref={seatRef} className={`absolute ${getPositionClasses(position)} z-30`}>
        <div
          className={`
            ${playerGradient} overflow-hidden rounded-xl shadow-md
            ${isActive ? 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/30' : ''}
            transition-all duration-200
            ${isSideSeat ? 'flex w-full flex-col' : 'flex flex-row items-stretch'}
          `}
          style={
            isSideSeat
              ? { width: avatarSize }
              : { height: avatarSize }
          }
        >
          <div
            className="relative shrink-0"
            style={{
              width: avatarSize,
              height: avatarSize,
              padding: avatarInset,
              boxSizing: 'border-box',
            }}
          >
            <div className="relative h-full w-full" style={{ width: avatarInner, height: avatarInner }}>
              {isHuman ? (
                <PlayerProfileDropdown
                  player={player}
                  isCurrentUser={player.id === user?.id}
                  onViewStats={() => handleViewPlayerStats(player)}
                  onShowEmojiPicker={() => {}}
                  onEmojiReaction={(emoji) => handleEmojiReaction(player.id, emoji)}
                  onSendEmoji={(emoji) => handleSendEmoji(player.id, emoji)}
                  onOpenAdminPanel={onOpenAdminPanel}
                  playerPosition={position}
                >
                  {avatarFrame}
                </PlayerProfileDropdown>
              ) : (
                avatarFrame
              )}
            </div>
          </div>
          <div
            className={`
              flex min-w-0 flex-col items-stretch justify-center
              ${textPanelPad}
              ${isSideSeat ? 'w-full' : 'h-full'}
            `}
            style={
              isSideSeat
                ? { minHeight: avatarSize, width: '100%' }
                : { width: bidChipWidth, height: '100%' }
            }
          >
              <div
                className="w-full truncate px-0 text-center font-semibold text-white"
                style={{ fontSize: nameFontSize, lineHeight: 1.15 }}
                title={displayName}
              >
                {displayName}
              </div>
              <div
                className={`${nameToBidGap} flex w-full items-center justify-center gap-0.5 rounded-full bg-white shadow-inner`}
                style={{
                  height: bidChipHeight,
                  minHeight: bidChipHeight,
                }}
              >
                <span
                  style={{
                    fontSize: bidFontSize,
                    fontWeight: 700,
                    color: 'black',
                    minWidth: isVerySmallScreen ? 7 : 9,
                    textAlign: 'center',
                  }}
                >
                  {gameState.status === "WAITING" ? "0" : madeCount}
                </span>
                <span style={{ fontSize: bidFontSize, color: 'black' }}>/</span>
                <span
                  style={{
                    fontSize: bidFontSize,
                    fontWeight: 700,
                    color: 'black',
                    minWidth: isVerySmallScreen ? 7 : 9,
                    textAlign: 'center',
                  }}
                >
                  {hasBid ? formatBid(bidCount, isBlindNil) : "0"}
                </span>
                <span
                  style={{
                    fontSize: statusFontSize,
                    minWidth: isVerySmallScreen ? 11 : 13,
                    textAlign: 'center',
                  }}
                >
                  {madeStatus}
                </span>
              </div>
              {isAway && user?.id && player.id === user.id && onImBack && gameState.status !== 'WAITING' && (
                <button
                  type="button"
                  onClick={onImBack}
                  className="mt-1 rounded bg-emerald-700 px-1.5 py-0.5 text-[7px] font-semibold text-white hover:bg-emerald-600 sm:text-[8px]"
                >
                  I&apos;m back
                </button>
              )}
              {isSpectating &&
                onRequestSubSeat &&
                (gameState.status === 'BIDDING' || gameState.status === 'PLAYING') &&
                (isBot(player) || (isHuman && isAway)) && (
                  <button
                    type="button"
                    onClick={() => onRequestSubSeat(actualSeatIndex)}
                    className="mt-1 rounded bg-amber-700 px-1.5 py-0.5 text-[7px] font-semibold text-white hover:bg-amber-600 sm:text-[8px]"
                  >
                    Request seat
                  </button>
                )}
          </div>
        </div>
        
        {/* Coin debit animation */}
        {showCoinDebit && (
          <CoinDebitAnimation 
            amount={coinDebitAmount} 
            isVisible={showCoinDebit} 
          />
        )}
        
        {/* Speech bubble for West player only */}
        {position === 1 && player && recentChatMessages[player.id] && (
          <>
            <div 
              className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-4 w-0 h-0 border-transparent"
              style={{
                borderLeftWidth: '8px',
                borderRightWidth: '8px',
                borderTopWidth: '0px',
                borderBottomWidth: '24px',
                borderBottomColor: 'white'
              }}
            ></div>
            {/* Speech bubble container */}
            <div className="absolute z-50 top-full left-0 mt-10 ml-4">
              <div 
                className="bg-white rounded-lg px-4 py-3 mt-[-8px]"
                style={{
                  minWidth: '120px',
                  maxWidth: '140px'
                }}
              >
                <div className="text-gray-800 font-black" style={{ 
                  fontSize: recentChatMessages[player.id].message.length <= 4 ? '1.5rem' : '1rem',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {recentChatMessages[player.id].message}
                </div>
              </div>
            </div>
          </>
        )}
        
        {/* Speech bubble for East player only */}
        {position === 3 && player && recentChatMessages[player.id] && (
          <>
            <div className="absolute z-50 top-full right-1/2 translate-x-1/2 mt-4">
            <div 
              className="w-0 h-0 border-transparent"
              style={{
                  borderLeftWidth: '8px',
                  borderRightWidth: '8px',
                borderTopWidth: '0px',
                  borderBottomWidth: '24px',
                borderBottomColor: 'white'
              }}
            ></div>
          </div>
            {/* Speech bubble container */}
            <div className="absolute z-50 top-full right-0 mt-10 mr-4">
              <div 
                className="bg-white rounded-lg px-4 py-3 mt-[-8px]"
                style={{
                  minWidth: '120px',
                  maxWidth: '140px'
                }}
              >
                <div className="text-gray-800 font-black text-right" style={{ 
                  fontSize: recentChatMessages[player.id].message.length <= 4 ? '1.5rem' : '1rem',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {recentChatMessages[player.id].message}
                </div>
              </div>
            </div>
          </>
        )}
        
        {/* Speech bubble for North player only */}
        {position === 0 && player && recentChatMessages[player.id] && (
          <>
            <div className="absolute z-50 right-full top-1/2 -translate-y-1/2 mr-4">
              <div 
                className="w-0 h-0 border-transparent"
                style={{
                  borderLeftWidth: '24px',
                  borderRightWidth: '0px',
                  borderTopWidth: '8px',
                  borderBottomWidth: '8px',
                  borderLeftColor: 'white'
                }}
              ></div>
            </div>
            {/* Speech bubble container */}
            <div className="absolute z-50 bottom-0 right-0 mb-4" style={{ marginBottom: '15px', right: isMobile ? '120px' : '180px' }}>
              <div 
                className="bg-white rounded-lg px-4 py-3 ml-[-8px]"
                style={{
                  minWidth: '120px',
                  maxWidth: '140px'
                }}
              >
                <div className="text-gray-800 font-black text-left" style={{ 
                  fontSize: recentChatMessages[player.id].message.length <= 4 ? '1.5rem' : '1rem',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {recentChatMessages[player.id].message}
                </div>
              </div>
            </div>
          </>
        )}
        
        {/* Speech bubble for South player only */}
        {position === 2 && player && recentChatMessages[player.id] && (
          <>
            <div className="absolute z-50 right-full top-1/2 -translate-y-1/2 mr-4">
              <div 
                className="w-0 h-0 border-transparent"
                style={{
                  borderLeftWidth: '24px',
                  borderRightWidth: '0px',
                  borderTopWidth: '8px',
                  borderBottomWidth: '8px',
                  borderLeftColor: 'white'
                }}
              ></div>
            </div>
            {/* Speech bubble container */}
            <div className="absolute z-50 top-0 right-0 mt-4" style={{ marginTop: '15px', right: isMobile ? '120px' : '180px' }}>
              <div 
                className="bg-white rounded-lg px-4 py-3 ml-[-8px]"
                style={{
                  minWidth: '120px',
                  maxWidth: '140px'
                }}
              >
                <div className="text-gray-800 font-black text-left" style={{ 
                  fontSize: recentChatMessages[player.id].message.length <= 4 ? '1.5rem' : '1rem',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {recentChatMessages[player.id].message}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Players around the table */}
      {[0, 1, 2, 3].map((position) => (
        <div key={`player-position-${position}`}>
          {renderPlayerPosition(position)}
        </div>
      ))}
    </>
  );
}
