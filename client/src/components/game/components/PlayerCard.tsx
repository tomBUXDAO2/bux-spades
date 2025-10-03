import React from 'react';
import { FaRobot, FaMinus } from 'react-icons/fa';
import type { GameState, Player, Bot } from "../../types/game"""""';
import PlayerProfileDropdown from './PlayerProfileDropdown';
import EmojiReaction from './EmojiReaction';
import CoinDebitAnimation from './CoinDebitAnimation';
import { getPlayerStatus, getPlayerBidInfo } from './PlayerStatusHelper';

interface PlayerCardProps {
  gameState: GameState;
  user: any;
  player: Player | Bot | null;
  position: number;
  currentPlayerId: string | null;
  countdownPlayer: {playerId: string, playerIndex: number, timeLeft: number} | null;
  isVerySmallScreen: boolean;
  isMobile: boolean;
  scaleFactor: number;
  invitingBotSeat: number | null;
  handleInviteBot: (position: number) => void;
  handleRemoveBot: (position: number) => void;
  handleViewPlayerStats: (player: Player) => void;
  handleEmojiReaction: (playerId: string, emoji: string) => void;
  handleEmojiComplete: (playerId: string) => void;
  handleSendEmoji: (targetPlayerId: string, emoji: string) => void;
  emojiReactions: Record<string, { emoji: string; timestamp: number }>;
  showCoinDebit: boolean;
  coinDebitAmount: number;
  recentChatMessages: Record<string, { message: string; timestamp: number }>;
  isPlayer: (player: any) => player is Player;
  isBot: (player: any) => player is Bot;
}

const BOT_AVATAR = "/bot-avatar.jpg";

export const PlayerCard: React.FC<PlayerCardProps> = ({
  gameState,
  user,
  player,
  position,
  currentPlayerId,
  countdownPlayer,
  isVerySmallScreen,
  isMobile,
  scaleFactor,
  invitingBotSeat,
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
  isBot
}) => {
  const playerStatus = getPlayerStatus({
    gameState,
    player,
    position,
    currentPlayerId,
    countdownPlayer,
    isPlayer,
    isBot
  });

  const bidInfo = getPlayerBidInfo(gameState, player, position);

  if (!player) {
    // Empty seat - show invite bot button
    if (playerStatus.canInvite) {
      return (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <button
            onClick={() => handleInviteBot(position)}
            disabled={invitingBotSeat === position}
            className={`
              ${invitingBotSeat === position ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-600'}
              bg-green-500 text-white rounded-full p-2 transition-colors duration-200
              ${isVerySmallScreen ? 'w-8 h-8' : isMobile ? 'w-10 h-10' : 'w-12 h-12'}
            `}
            title="Invite Bot"
          >
            <FaRobot className="w-full h-full" />
          </button>
        </div>
      );
    }
    return null;
  }

  const {
    isActive,
    isCurrentPlayer,
    isOnCountdown,
    shouldShowTimer,
    isHuman,
    isBot: isBotPlayer
  } = playerStatus;

  const isSideSeat = position === 1 || position === 3;
  const playerGradient = isActive 
    ? 'bg-gradient-to-r from-yellow-400 to-yellow-600' 
    : 'bg-gradient-to-r from-gray-400 to-gray-600';

  const avatarWidth = isVerySmallScreen ? 24 : (isMobile ? 32 : 40);
  const avatarHeight = isVerySmallScreen ? 24 : (isMobile ? 32 : 40);

  return (
    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
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
                <div className="rounded-full p-0.5 bg-gradient-to-r from-gray-400 to-gray-600
                  hover:from-gray-300 hover:to-gray-500 transition-all duration-200 cursor-pointer">
                  <img
                    src={player.avatar || '/default-pfp.jpg'}
                    alt={player.username}
                    className="rounded-full"
                    style={{ width: avatarWidth, height: avatarHeight }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/default-pfp.jpg';
                    }}
                  />
                </div>
              </PlayerProfileDropdown>
            ) : (
              <div className="rounded-full p-0.5 bg-gradient-to-r from-gray-400 to-gray-600">
                <img
                  src={BOT_AVATAR}
                  alt="Bot"
                  className="rounded-full"
                  style={{ width: avatarWidth, height: avatarHeight }}
                />
              </div>
            )}
            
            {/* Emoji reaction */}
            {emojiReactions[player.id] && (
              <EmojiReaction
                emoji={emojiReactions[player.id].emoji}
                onComplete={() => handleEmojiComplete(player.id)}
              />
            )}
          </div>

          {/* Player name and status */}
          <div className={`text-center ${isSideSeat ? 'w-full' : 'ml-2'}`}>
            <div className={`font-bold text-white ${isVerySmallScreen ? 'text-xs' : 'text-sm'}`}>
              {player.username}
            </div>
            
            {/* Bid display */}
            {bidInfo && (
              <div className={`text-yellow-200 ${isVerySmallScreen ? 'text-xs' : 'text-sm'}`}>
                {bidInfo.isPartnerGame ? (
                  <span>Bid: {bidInfo.formattedBid} (Total: {bidInfo.totalBid})</span>
                ) : (
                  <span>Bid: {bidInfo.formattedBid}</span>
                )}
              </div>
            )}

            {/* Recent chat message */}
            {recentChatMessages[player.id] && (
              <div className={`text-green-200 ${isVerySmallScreen ? 'text-xs' : 'text-sm'} max-w-20 truncate`}>
                {recentChatMessages[player.id].message}
              </div>
            )}
          </div>

          {/* Remove bot button */}
          {isBotPlayer && playerStatus.canRemove && (
            <button
              onClick={() => handleRemoveBot(position)}
              className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 transition-colors duration-200"
              title="Remove Bot"
            >
              <FaMinus className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Countdown timer overlay */}
        {shouldShowTimer && (
          <div className="absolute inset-0 bg-red-500 bg-opacity-75 rounded-xl flex items-center justify-center">
            <div className="text-white font-bold text-lg">
              {countdownPlayer?.timeLeft ?? 0}s
            </div>
          </div>
        )}

        {/* Coin debit animation */}
        {showCoinDebit && player.id === user?.id && (
          <CoinDebitAnimation
            amount={coinDebitAmount}
            isVisible={true}
          />
        )}
      </div>
    </div>
  );
};
