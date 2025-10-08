import React from 'react';
import { FaRobot, FaMinus } from 'react-icons/fa';
import type { GameState, Player, Bot } from "../../../types/game";
import PlayerProfileDropdown from './PlayerProfileDropdown';
import EmojiReaction from './EmojiReaction';
import CoinDebitAnimation from './CoinDebitAnimation';
import { abbreviateBotName } from '../../../utils/botUtils';

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
  pendingBid
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
      
      // Apply responsive adjustments
      if (windowSize.width < 768) {
        // Tighter positioning for smaller screens - also at edge
        const mobilePositions = [
          'bottom-0 left-1/2 -translate-x-1/2',  // South
          'left-0 top-1/2 -translate-y-1/2',     // West
          'top-0 left-1/2 -translate-x-1/2',     // North
          'right-0 top-1/2 -translate-y-1/2'     // East
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
            onClick={() => joinGame(gameState.id, user.id, { seat: position, username: user.username, avatar: user.avatar })}
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
    const avatarWidth = isVerySmallScreen ? 24 : (isMobile ? 32 : 40);
    const avatarHeight = isVerySmallScreen ? 24 : (isMobile ? 32 : 40);
    
    // Determine game mode early for color selection
    const isPartnerGame = ((gameState as any).gameMode || (gameState as any).rules?.gameType) === 'PARTNERS';
    const isSoloGame = ((gameState as any).gameMode || (gameState as any).rules?.gameType) === 'SOLO';
    
    // Determine player color based on game mode
    let playerGradient;
    if (isSoloGame) {
      // Solo mode: 4 individual colors - use original position for consistent colors across all players
      const soloColors = [
        "bg-gradient-to-r from-red-700 to-red-500",    // Position 0: Red
        "bg-gradient-to-r from-blue-700 to-blue-500",  // Position 1: Blue
        "bg-gradient-to-r from-orange-600 to-orange-400", // Position 2: Orange
        "bg-gradient-to-r from-green-700 to-green-500"  // Position 3: Green
      ];
      // Use original position for color assignment, not display position
      const originalPosition = player.seatIndex ?? position;
      playerGradient = soloColors[originalPosition];
    } else {
      // Partners mode: 2 team colors
      // Team 1 (positions 0,2) = Red Team
      // Team 2 (positions 1,3) = Blue Team
      const redTeamGradient = "bg-gradient-to-r from-red-700 to-red-500";
      const blueTeamGradient = "bg-gradient-to-r from-blue-700 to-blue-500";
      
      // Use ORIGINAL position for team assignment, not display position
      // Get the original position from the player object
      const originalPosition = player.seatIndex ?? position;
      playerGradient = (originalPosition === 0 || originalPosition === 2)
        ? redTeamGradient
        : blueTeamGradient;
    }
    // Calculate bid/made/tick/cross logic for both bots and humans
    const madeCount = player.tricks || 0;
    // Use the player's position in the players array to match the server's bidding.bids array
    // The server's bidding.bids array is indexed by the player's position in the players array (0,1,2,3)
    const actualSeatIndex = position;
    let rawBid = (gameState as any).bidding?.bids?.[actualSeatIndex];
    
    // OPTIMISTIC UI: Show pending bid immediately
    if (pendingBid && pendingBid.playerId === player.id) {
      rawBid = pendingBid.bid;
      console.log('[OPTIMISTIC BID] Displaying pending bid for player:', player.id, 'bid:', pendingBid.bid);
    }
    
    
    const bidCount = rawBid !== null && rawBid !== undefined ? rawBid : 0;
    const hasBid = rawBid !== null && rawBid !== undefined;
    
    let madeStatus = null;
    const tricksLeft = gameState.status === 'PLAYING' ? 13 - ((gameState as any).play?.tricks?.length || 0) : 13;
    const formatBid = (bid: number | null) => {
      if (bid === null || bid === undefined) return "0";
      if (bid === -1) return "bn";
      if (bid === 0) return "n";
      return bid.toString();
    };
    
    if (isPartnerGame) {
      // Partner game logic - use array positions for partner calculation
      const partnerPosition = (position + 2) % 4;
      const partner = gameState.players[partnerPosition];
      const partnerBid = (gameState as any).bidding?.bids?.[partnerPosition] ?? 0;
      const partnerMade = partner && partner.tricks ? partner.tricks : 0;
      
      // Calculate team totals
      const teamBid = bidCount + partnerBid;
      const teamMade = madeCount + partnerMade;
      
      // Nil bid: show cross if they take a trick, tick if they make it through
      if (bidCount === 0) {
        if (madeCount > 0) {
          madeStatus = '❌'; // Failed nil
        } else if (tricksLeft === 0) {
          madeStatus = '✅'; // Successful nil (hand complete)
        } else {
          madeStatus = null; // Still in progress
        }
      } else {
        // Non-nil: tick if teamMade >= teamBid, cross if teamMade < teamBid
        if (teamBid > 0) {
          if (teamMade >= teamBid) {
            madeStatus = '✅'; // Team made their bid
          } else if (teamMade + tricksLeft < teamBid) {
            madeStatus = '❌'; // Team cannot make their bid
          } else {
            madeStatus = null; // Still possible to make bid
          }
        } else {
          madeStatus = null; // No bid
        }
      }
    } else if (isSoloGame) {
      // Solo game logic (individual player)
      if (bidCount === 0) {
        // Nil bid
        if (madeCount > 0) {
          madeStatus = '❌'; // Failed nil
        } else if (tricksLeft === 0) {
          madeStatus = '✅'; // Successful nil
        } else {
          madeStatus = null; // Still in progress
        }
      } else if (bidCount > 0) {
        // Regular bid
        if (madeCount >= bidCount) {
          madeStatus = '✅'; // Made bid
        } else if (madeCount + tricksLeft < bidCount) {
          madeStatus = '❌'; // Cannot make bid
        } else {
          madeStatus = null; // Still possible
        }
      } else {
        madeStatus = null; // No bid
      }
    } else {
      // Fallback: hide
      madeStatus = null;
    }
    
    // Debug logging for tick/cross logic
    if (gameState.status === 'PLAYING' && (bidCount > 0 || madeCount > 0)) {
      if (isPartnerGame) {
        // Use the same actualSeatIndex calculation as above for consistency
        const partnerPosition = (actualSeatIndex + 2) % 4;
        const partnerBid = (gameState as any).bidding?.bids?.[partnerPosition] ?? 0;
        const partnerMade = gameState.players?.[partnerPosition]?.tricks ?? 0;
        const teamBid = bidCount + partnerBid;
        const teamMade = madeCount + partnerMade;
      } else {
      }
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
    
    // Debug avatar loading
    if (isHuman && player.id === user?.id) {
    }
    return (
      <div className={`absolute ${getPositionClasses(position)} z-30`}>
        <div className={`
          ${playerGradient} rounded-xl
          ${isActive ? 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/30' : 'shadow-md'}
          transition-all duration-200
        `}>
          <div className={isSideSeat ? `flex flex-col items-center ${isVerySmallScreen ? 'p-1 gap-1' : 'p-1.5 gap-1.5'}` : `flex items-center ${isVerySmallScreen ? 'p-1 gap-1' : 'p-1.5 gap-1.5'}`}>
            <div className="relative">
              {isHuman ? (
                <PlayerProfileDropdown
                  player={player}
                  isCurrentUser={player.id === user?.id}
                  onViewStats={() => handleViewPlayerStats(player)}
                  onShowEmojiPicker={() => {}}
                  onEmojiReaction={(emoji) => handleEmojiReaction(player.id, emoji)}
                  onSendEmoji={(emoji) => handleSendEmoji(player.id, emoji)}
                  playerPosition={position}
                >
                  <div className="rounded-full p-0.5 bg-gradient-to-r from-gray-400 to-gray-600" data-player-id={player.id}>
                    <div className="bg-gray-900 rounded-full p-0.5 relative">
                      <img
                        src={displayAvatar}
                        alt={displayName}
                        width={avatarWidth}
                        height={avatarHeight}
                        className="rounded-full object-cover"
                      />
                      {/* Emoji reaction overlay */}
                      {emojiReactions[player.id] && (
                        <EmojiReaction
                          emoji={emojiReactions[player.id].emoji}
                          onComplete={() => handleEmojiComplete(player.id)}
                        />
                      )}
                      {/* Remove button */}
                      {canRemovePlayer && (
                        <div className="absolute -bottom-2 -left-2 z-50">
                          <button
                            className={`${isVerySmallScreen ? 'w-4 h-4' : 'w-5 h-5'} bg-red-600 text-white rounded-full flex items-center justify-center text-xs border-2 border-white shadow hover:bg-red-700 transition`}
                            title={isHuman ? "Remove Player" : "Remove Bot"}
                            onClick={() => handleRemoveBot(position)}
                          >
                            <FaMinus className={isVerySmallScreen ? "w-2 h-2" : "w-2.5 h-2.5"} />
                          </button>
                        </div>
                      )}
                      {/* Dealer chip for bots */}
                      {player.isDealer && (
                        <>
                          <div className="absolute -bottom-1 -right-1">
                            <div className={`flex items-center justify-center ${isVerySmallScreen ? 'w-4 h-4' : 'w-5 h-5'} rounded-full bg-gradient-to-r from-yellow-300 to-yellow-500 shadow-md`}>
                              <div className={`${isVerySmallScreen ? 'w-3 h-3' : 'w-4 h-4'} rounded-full bg-yellow-600 flex items-center justify-center`}>
                                <span className={`${isVerySmallScreen ? 'text-[6px]' : 'text-[8px]'} font-bold text-yellow-200`}>D</span>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                      {/* Timer overlay for last 10 seconds */}
                      {shouldShowTimerOnPlayer && (
                        <div className="absolute inset-0 bg-red-500 bg-opacity-80 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-lg">{countdownPlayer?.timeLeft || 0}</span>
                        </div>
                      )}
                      
                      {/* Countdown overlay: only show once time has fully elapsed, on the current player's turn */}
                      {Boolean(isPlayerOnCountdown && isCurrentPlayer && (countdownPlayer?.timeLeft ?? 0) > 0) && (
                        <div className="absolute inset-0 bg-orange-500 bg-opacity-80 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-lg">{countdownPlayer?.timeLeft ?? 0}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </PlayerProfileDropdown>
              ) : (
                <div className="rounded-full p-0.5 bg-gradient-to-r from-gray-400 to-gray-600" data-player-id={player.id}>
                <div className="bg-gray-900 rounded-full p-0.5">
                  <img
                    src={displayAvatar}
                    alt={displayName}
                    width={avatarWidth}
                    height={avatarHeight}
                    className="rounded-full object-cover"
                  />
                    {/* Remove button */}
                    {canRemovePlayer && (
                      <div className="absolute -bottom-2 -left-2 z-50">
                    <button
                          className={`${isVerySmallScreen ? 'w-4 h-4' : 'w-5 h-5'} bg-red-600 text-white rounded-full flex items-center justify-center text-xs border-2 border-white shadow hover:bg-red-700 transition`}
                          title={isHuman ? "Remove Player" : "Remove Bot"}
                      onClick={() => handleRemoveBot(position)}
                    >
                      <FaMinus className={isVerySmallScreen ? "w-2 h-2" : "w-2.5 h-2.5"} />
                    </button>
                      </div>
                  )}
                  {/* Dealer chip for bots */}
                  {player.isDealer && (
                    <>
                      <div className="absolute -bottom-1 -right-1">
                        <div className={`flex items-center justify-center ${isVerySmallScreen ? 'w-4 h-4' : 'w-5 h-5'} rounded-full bg-gradient-to-r from-yellow-300 to-yellow-500 shadow-md`}>
                          <div className={`${isVerySmallScreen ? 'w-3 h-3' : 'w-4 h-4'} rounded-full bg-yellow-600 flex items-center justify-center`}>
                            <span className={`${isVerySmallScreen ? 'text-[6px]' : 'text-[8px]'} font-bold text-yellow-200`}>D</span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  {/* Timer overlay for last 10 seconds */}
                  {shouldShowTimerOnPlayer && (
                    <div className="absolute inset-0 bg-red-500 bg-opacity-80 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-lg">{countdownPlayer?.timeLeft || 0}</span>
                    </div>
                  )}
                  
                  {/* Countdown overlay: only show once time has fully elapsed, on the current player's turn */}
                  {Boolean(isPlayerOnCountdown && isCurrentPlayer && (countdownPlayer?.timeLeft ?? 0) > 0) && (
                    <div className="absolute inset-0 bg-orange-500 bg-opacity-80 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-lg">{countdownPlayer?.timeLeft ?? 0}</span>
                    </div>
                  )}
                </div>
              </div>
              )}
            </div>
            <div className={`flex flex-col items-center ${isVerySmallScreen ? 'gap-0.5' : 'gap-1'}`}>
              <div className="w-full px-2 py-1 rounded-lg shadow-sm" style={{ width: isVerySmallScreen ? '40px' : (isMobile ? '50px' : '70px') }}>
                <div className="text-white font-medium truncate text-center" style={{ fontSize: isVerySmallScreen ? '7px' : (isMobile ? '9px' : '11px') }}>
                  {displayName}
                </div>
              </div>
              {/* Bid/Trick counter for bots, same as humans */}
              <div className="bg-white rounded-full px-2 py-1 shadow-inner flex items-center justify-center gap-1"
                   style={{ 
                     width: isVerySmallScreen ? '45px' : (isMobile ? '60px' : '80px'),
                     minWidth: isVerySmallScreen ? '45px' : (isMobile ? '60px' : '80px'),
                     height: isVerySmallScreen ? '20px' : (isMobile ? '24px' : '28px'),
                     minHeight: isVerySmallScreen ? '20px' : (isMobile ? '24px' : '28px')
                   }}>
                <span style={{ fontSize: isVerySmallScreen ? '9px' : (isMobile ? '11px' : '13px'), fontWeight: 600, color: 'black', minWidth: isVerySmallScreen ? '6px' : (isMobile ? '8px' : '10px'), textAlign: 'center' }}>
                  {gameState.status === "WAITING" ? "0" : madeCount}
                </span>
                <span style={{ fontSize: isVerySmallScreen ? '9px' : (isMobile ? '11px' : '13px'), color: 'black' }}>/</span>
                <span style={{ fontSize: isVerySmallScreen ? '9px' : (isMobile ? '11px' : '13px'), fontWeight: 600, color: 'black', minWidth: isVerySmallScreen ? '6px' : (isMobile ? '8px' : '10px'), textAlign: 'center' }}>
                  {hasBid ? formatBid(bidCount) : "0"}
                </span>
                <span style={{ fontSize: isVerySmallScreen ? '10px' : (isMobile ? '12px' : '14px'), minWidth: isVerySmallScreen ? '10px' : (isMobile ? '12px' : '14px'), textAlign: 'center' }}>
                  {madeStatus}
                </span>
              </div>
            </div>
            {/* playedCard && (
              <div className="flex justify-center mt-2">
                <img
                  src={`/optimized/cards/${getCardImage(playedCard)}`}
                  alt={`${playedCard.rank} of ${playedCard.suit}`}
                  style={{ width: 60, height: 90, objectFit: 'contain', borderRadius: 8, boxShadow: '0 2px 8px #0004' }}
                />
              </div>
            ) */}
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
            <div className="absolute z-50 bottom-0 right-0 mb-4" style={{ marginBottom: '15px', right: '180px' }}>
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
            <div className="absolute z-50 top-0 right-0 mt-4" style={{ marginTop: '15px', right: '180px' }}>
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
