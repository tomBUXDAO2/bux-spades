import React, { useRef } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import type { Player, Bot } from "../../../../types/game";
import { abbreviateBotName } from "../../../../utils/botUtils";

interface ChatMessage {
  id?: string;
  userId: string;
  userName: string;
  message: string;
  userAvatar?: string;
  timestamp: number;
  isGameMessage?: boolean;
}

interface ChatSectionProps {
  mobileTab: 'lobby' | 'chat';
  activeChatTab: 'chat' | 'players';
  onlineCount: number;
  chatMessages: ChatMessage[];
  newMessage: string;
  showEmojiPicker: boolean;
  onlinePlayers: any[];
  playerFilter: 'all' | 'friends' | 'hide-blocked';
  user: any | null;
  canSendChat: boolean;
  onRequestSignIn?: () => void;
  chatContainerRef: React.RefObject<HTMLDivElement>;
  inputRef: React.RefObject<HTMLInputElement>;
  onSetActiveChatTab: (tab: 'chat' | 'players') => void;
  onSetNewMessage: (message: string) => void;
  onSetShowEmojiPicker: (show: boolean) => void;
  onSetPlayerFilter: (filter: 'all' | 'friends' | 'hide-blocked') => void;
  onSendMessage: (e: React.FormEvent) => void;
  onSelectEmoji: (emoji: any) => void;
  onOpenPlayerStats: (player: any) => void;
  onWatchGame: (gameId: string) => void;
  onSetConfirmModal: (modal: { open: boolean; player: any; action: 'add_friend' | 'remove_friend' | 'block_user' | 'unblock_user' }) => void;
  formatTime: (timestamp: number) => string;
  getUserAvatar: (userId: string) => string;
}

// Add type guards if not present
function isPlayer(p: any): p is Player {
  return p && typeof p === 'object' && ((('type' in p) && p.type !== 'bot') || !('type' in p));
}
function isBot(p: any): p is Bot {
  return p && typeof p === 'object' && 'type' in p && p.type === 'bot';
}

const ChatSection: React.FC<ChatSectionProps> = ({
  mobileTab,
  activeChatTab,
  onlineCount,
  chatMessages,
  newMessage,
  showEmojiPicker,
  onlinePlayers,
  playerFilter,
  user,
  canSendChat,
  onRequestSignIn,
  chatContainerRef,
  inputRef,
  onSetActiveChatTab,
  onSetNewMessage,
  onSetShowEmojiPicker,
  onSetPlayerFilter,
  onSendMessage,
  onSelectEmoji,
  onOpenPlayerStats,
  onWatchGame,
  onSetConfirmModal,
  formatTime,
  getUserAvatar
}) => {
  // Detect screen width for responsive sizing
  const [screenWidth, setScreenWidth] = React.useState(window.innerWidth);
  
  React.useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Apply scaling for 600-649px screens (landscape)
  const isSmallScreen = screenWidth >= 600 && screenWidth <= 649;
  // Apply medium scaling for 650-699px screens
  const isMediumScreen = screenWidth >= 650 && screenWidth <= 699;
  // Apply large scaling for 700-749px screens
  const isLargeScreen = screenWidth >= 700 && screenWidth <= 749;
  // Apply extra large scaling for 750-799px screens
  const isExtraLargeScreen = screenWidth >= 750 && screenWidth <= 799;
  const textScale = isSmallScreen ? 0.85 : (isMediumScreen ? 0.9 : (isLargeScreen ? 0.95 : (isExtraLargeScreen ? 0.98 : 1)));
  const inputScale = isSmallScreen ? 0.8 : (isMediumScreen ? 0.85 : (isLargeScreen ? 0.9 : (isExtraLargeScreen ? 0.95 : 1)));
  
  // Detect portrait mode for height adjustment
  const isPortrait = window.innerHeight > window.innerWidth;
  const mobileToggleHeight = isPortrait ? 46 : 0; // Approximately 46px for MobileToggle in portrait
  
  return (
    <div
      className="flex flex-col rounded-xl border border-white/10 bg-slate-950/45 shadow-lobby backdrop-blur-xl lg:col-span-1 col-span-1"
      style={{ 
        height: isSmallScreen ? `calc(100vh - 64px - 16px - ${mobileToggleHeight}px)` : (isMediumScreen ? `calc(100vh - 64px - 24px - ${mobileToggleHeight}px)` : (isLargeScreen ? `calc(100vh - 64px - 28px - ${mobileToggleHeight}px)` : (isExtraLargeScreen ? `calc(100vh - 64px - 16px - ${mobileToggleHeight}px)` : `calc(100vh - 64px - 32px - ${mobileToggleHeight}px)`))),
        padding: isSmallScreen ? '8px' : (isMediumScreen ? '12px' : (isLargeScreen ? '14px' : (isExtraLargeScreen ? '12px' : (screenWidth >= 640 ? '16px' : '8px'))))
      }}
    >
      {/* Chat/Players Header */}
      <div className="flex items-center justify-between mb-2 sm:mb-4">
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            className={`lobby-button flex items-center justify-center rounded-lg text-xs font-semibold transition sm:text-sm ${activeChatTab === 'chat' ? 'bg-gradient-to-r from-cyan-500 to-teal-600 shadow-md shadow-cyan-950/30' : 'border border-white/10 bg-white/5 hover:bg-white/10'}`}
            onClick={() => onSetActiveChatTab('chat')}
            aria-label="Chat"
            style={{ width: isSmallScreen ? '32px' : (isMediumScreen ? '36px' : (isLargeScreen ? '42px' : (isExtraLargeScreen ? '48px' : '80px'))), height: isSmallScreen ? '24px' : (isMediumScreen ? '28px' : (isLargeScreen ? '32px' : (isExtraLargeScreen ? '36px' : '40px'))) }}
          >
            <img src="/chat.svg" alt="Chat" className="" style={{ width: isSmallScreen ? '16px' : (isMediumScreen ? '18px' : (isLargeScreen ? '20px' : (isExtraLargeScreen ? '22px' : '24px'))), height: isSmallScreen ? '16px' : (isMediumScreen ? '18px' : (isLargeScreen ? '20px' : (isExtraLargeScreen ? '22px' : '24px'))), filter: 'invert(1) brightness(2)' }} />
          </button>
          <button
            className={`lobby-button flex items-center justify-center rounded-lg text-xs font-semibold transition sm:text-sm ${activeChatTab === 'players' ? 'bg-gradient-to-r from-cyan-500 to-teal-600 shadow-md shadow-cyan-950/30' : 'border border-white/10 bg-white/5 hover:bg-white/10'}`}
            onClick={() => onSetActiveChatTab('players')}
            aria-label="Players"
            style={{ width: isSmallScreen ? '32px' : (isMediumScreen ? '36px' : (isLargeScreen ? '42px' : (isExtraLargeScreen ? '48px' : '80px'))), height: isSmallScreen ? '24px' : (isMediumScreen ? '28px' : (isLargeScreen ? '32px' : (isExtraLargeScreen ? '36px' : '40px'))) }}
          >
            <img src="/players.svg" alt="Players" className="" style={{ width: isSmallScreen ? '16px' : (isMediumScreen ? '18px' : (isLargeScreen ? '20px' : (isExtraLargeScreen ? '22px' : '24px'))), height: isSmallScreen ? '16px' : (isMediumScreen ? '18px' : (isLargeScreen ? '20px' : (isExtraLargeScreen ? '22px' : '24px'))), filter: 'invert(1) brightness(2)' }} />
          </button>
        </div>
        <div className="flex items-center space-x-1">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)] sm:h-2 sm:w-2"></span>
          <span className="text-xs font-medium text-slate-300 sm:text-sm" style={{ fontSize: `${14 * textScale}px` }}>{onlineCount} online</span>
        </div>
      </div>
      {/* Tab Content */}
      {activeChatTab === 'chat' ? (
        <>
          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto flex flex-col gap-y-4"
          >
            {chatMessages.map((msg, index) => (
              msg.userId === 'system' ? (
                <div
                  key={msg.id || index}
                  className="w-full text-center my-2"
                >
                  <span className="flex items-center justify-center gap-1 italic text-amber-400/95" style={{ fontSize: `${14 * textScale}px` }}>
                    {msg.message}
                  </span>
                </div>
              ) : (
                <div
                  key={msg.id || index}
                  className={`mb-2 flex items-start ${user && msg.userId === user.id ? 'justify-end' : ''}`}
                >
                  {!(user && msg.userId === user.id) && (
                    <div className={`w-8 h-8 mr-2 rounded-full overflow-hidden flex-shrink-0`}>
                      <img 
                        src={msg.userAvatar || getUserAvatar(msg.userId)} 
                        alt={msg.userName || ''} 
                        width={32}
                        height={32}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/default-pfp.jpg';
                        }}
                      />
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 ${user && msg.userId === user.id ? 'bg-gradient-to-br from-cyan-600 to-teal-700 text-white shadow-md shadow-cyan-950/25' : 'border border-white/10 bg-slate-800/90 text-slate-100'}`}>
                    <div className="flex justify-between items-center mb-1">
                      {!(user && msg.userId === user.id) && (
                        <span className="font-medium text-xs opacity-80" style={{ fontSize: `${12 * textScale}px` }}>{msg.userName}</span>
                      )}
                      <span className="text-xs opacity-75 ml-auto" style={{ fontSize: `${12 * textScale}px` }}> {formatTime(msg.timestamp)}</span>
                    </div>
                    <p style={{ fontSize: `${14 * textScale}px` }}>{msg.message}</p>
                  </div>
                  {user && msg.userId === user.id && (
                    <div className={`w-8 h-8 ml-2 rounded-full overflow-hidden flex-shrink-0`}>
                      <img 
                        src={msg.userAvatar || getUserAvatar(msg.userId)} 
                        alt={msg.userName || ''} 
                        width={32}
                        height={32}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/default-pfp.jpg';
                        }}
                      />
                    </div>
                  )}
                </div>
              )
            ))}
            {chatMessages.length === 0 && (
              <div className="text-center text-slate-400 py-4" style={{ fontSize: `${14 * textScale}px` }}>
                No messages yet. Start the conversation!
              </div>
            )}
          </div>
          <form onSubmit={onSendMessage} className="mt-auto relative">
            <div className="flex flex-row items-center space-x-2 w-full">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => onSetNewMessage(e.target.value)}
                placeholder={canSendChat ? 'Type a message...' : 'Sign in to chat'}
                disabled={!canSendChat}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 pr-10 text-slate-200 placeholder:text-slate-500 focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ fontSize: `${14 * inputScale}px` }}
                ref={inputRef}
              />
              {/* Emoji Picker Button */}
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-transparent transition hover:border-white/10 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ width: `${40 * inputScale}px`, height: `${40 * inputScale}px` }}
                  onClick={() => canSendChat && onSetShowEmojiPicker(!showEmojiPicker)}
                  disabled={!canSendChat}
                  tabIndex={-1}
                >
                  <span role="img" aria-label="emoji" style={{ fontSize: `${24 * inputScale}px` }}>😊</span>
                </button>
                {/* Emoji Picker Dropdown */}
                {showEmojiPicker && canSendChat && (
                  <div className="absolute right-0 bottom-12 z-50">
                    <Picker data={data} onEmojiSelect={onSelectEmoji} theme="dark" />
                  </div>
                )}
              </div>
              {/* Send Button as Icon (right-pointing) */}
              <button
                type="submit"
                disabled={!canSendChat}
                className="flex flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 shadow-md shadow-cyan-950/35 transition hover:from-cyan-400 hover:to-teal-500 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ width: `${40 * inputScale}px`, height: `${40 * inputScale}px` }}
                aria-label="Send"
              >
                {/* Right-pointing paper plane icon */}
                <svg className="text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ width: `${24 * inputScale}px`, height: `${24 * inputScale}px` }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l16 8-16 8 4-8z" />
                </svg>
              </button>
            </div>
            {!canSendChat && (
              <p className="text-slate-400 text-xs mt-2 text-center" style={{ fontSize: `${12 * textScale}px` }}>
                <button
                  type="button"
                  className="font-medium text-cyan-400 hover:text-cyan-300 hover:underline"
                  onClick={() => onRequestSignIn?.()}
                >
                  Sign in
                </button>
                {' '}to send messages
              </p>
            )}
          </form>
        </>
      ) : (
        <>
          {/* Friends summary row */}
          <div className="mb-2 flex flex-col justify-center rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-950/70 to-indigo-950/50" style={{ minHeight: isSmallScreen ? '48px' : (isMediumScreen ? '56px' : (isLargeScreen ? '60px' : (isExtraLargeScreen ? '56px' : '64px'))), padding: isSmallScreen ? '8px 12px' : (isMediumScreen ? '8px 16px' : (isLargeScreen ? '8px 20px' : (isExtraLargeScreen ? '8px 16px' : '8px 24px'))) }}>
            <div className="flex items-center justify-between" style={{ height: isSmallScreen ? '24px' : (isMediumScreen ? '28px' : (isLargeScreen ? '30px' : (isExtraLargeScreen ? '28px' : '32px'))) }}>
              <span className="flex items-center gap-2 text-slate-200 font-bold" style={{ fontSize: `${isSmallScreen ? 16 : (isMediumScreen ? 17 : (isLargeScreen ? 17.5 : (isExtraLargeScreen ? 17 : 18))) * textScale}px` }}>
                <img src="/friend.svg" alt="Friends" style={{ width: isSmallScreen ? '24px' : (isMediumScreen ? '28px' : (isLargeScreen ? '30px' : (isExtraLargeScreen ? '28px' : '32px'))), height: isSmallScreen ? '24px' : (isMediumScreen ? '28px' : (isLargeScreen ? '30px' : (isExtraLargeScreen ? '28px' : '32px'))), filter: 'invert(1) brightness(2)' }} />
                Friends: {Array.isArray(onlinePlayers) ? onlinePlayers.filter(p => p.status === 'friend').length : 0}
              </span>
              <span className="flex items-center gap-1 text-slate-300 font-medium" style={{ fontSize: `${14 * textScale}px` }}>
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                {Array.isArray(onlinePlayers) ? onlinePlayers.filter(p => p.status === 'friend' && p.online).length : 0} Online
              </span>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <label className="flex items-center gap-1 cursor-pointer text-slate-300" style={{ fontSize: `${14 * textScale}px` }}>
                <input
                  type="radio"
                  name="playerFilter"
                  value="all"
                  checked={playerFilter === 'all'}
                  onChange={() => onSetPlayerFilter('all')}
                  className="accent-cyan-500"
                />
                All
              </label>
              <label className="flex items-center gap-1 cursor-pointer text-slate-300" style={{ fontSize: `${14 * textScale}px` }}>
                <input
                  type="radio"
                  name="playerFilter"
                  value="friends"
                  checked={playerFilter === 'friends'}
                  onChange={() => onSetPlayerFilter('friends')}
                  className="accent-cyan-500"
                />
                Friends
              </label>
              <label className="flex items-center gap-1 cursor-pointer text-slate-300" style={{ fontSize: `${14 * textScale}px` }}>
                <input
                  type="radio"
                  name="playerFilter"
                  value="hide-blocked"
                  checked={playerFilter === 'hide-blocked'}
                  onChange={() => onSetPlayerFilter('hide-blocked')}
                  className="accent-cyan-500"
                />
                Hide Blocked
              </label>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 mb-4">
            {Array.isArray(onlinePlayers) ? onlinePlayers
              .filter(player =>
                // Comprehensive bot filtering (same as HomePage)
                !(
                  (player && typeof player === 'object' && 'type' in player && player.type === 'bot') ||
                  (typeof player?.username === 'string' && (player.username.startsWith('Bot ') || player.username.startsWith('Bot_'))) ||
                  (typeof player?.id === 'string' && player.id.startsWith('bot-'))
                ) && (
                  playerFilter === 'all' ? true :
                  playerFilter === 'friends' ? player.status === 'friend' :
                  playerFilter === 'hide-blocked' ? true :
                  true
                )
              )
              .sort((a, b) => {
                // First priority: friends come first
                if (a.status === 'friend' && b.status !== 'friend') return -1;
                if (b.status === 'friend' && a.status !== 'friend') return 1;
                
                // Second priority: online status
                if (b.online !== a.online) return Number(b.online) - Number(a.online);
                
                // Third priority: blocked status (when showing all)
                if (playerFilter === 'all') {
                  if (a.status === 'blocked' && b.status !== 'blocked') return 1;
                  if (b.status === 'blocked' && a.status !== 'blocked') return -1;
                }
                
                return 0;
              })
              .map(player => (
                <div key={player.id} className="flex items-center gap-3 rounded-lg border border-white/5 bg-slate-900/50 p-2">
                  <img src={isPlayer(player) ? (player.avatarUrl || '/default-pfp.jpg') : isBot(player) ? (player.avatar || '/bot-avatar.jpg') : '/bot-avatar.jpg'} alt="" className="w-8 h-8 rounded-full border-2 border-slate-600" />
                  <span
                    className={`font-medium ${player.online ? 'text-green-400' : 'text-slate-300'} flex items-center cursor-pointer hover:underline`}
                    style={{ fontSize: `${14 * textScale}px` }}
                    onClick={() => onOpenPlayerStats(player)}
                  >
                    {isPlayer(player) ? (player.username || player.name) : isBot(player) ? abbreviateBotName(player.username) : 'Player'}
                    {player.online && <span className="ml-2 inline-block w-2 h-2 bg-green-500 rounded-full"></span>}
                    {player.status === 'friend' && (
                      <img src="/friend.svg" alt="Friend" className="ml-2 w-6 h-6" style={{ filter: 'invert(1) brightness(2)' }} />
                    )}
                  </span>
                  <div className="flex gap-2 ml-auto items-center">
                    {/* Watch button when player is at a table */}
                    {user && (player.activeGameId || player.inGame) && player.id !== user.id && (
                      <button
                        className="flex items-center justify-center rounded-full border border-cyan-400/30 bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-sm hover:from-cyan-500 hover:to-teal-500"
                        style={{ fontSize: `${12 * textScale}px`, height: isSmallScreen ? '28px' : (isMediumScreen ? '30px' : (isLargeScreen ? '31px' : (isExtraLargeScreen ? '31.5px' : '32px'))), paddingLeft: isSmallScreen ? '6px' : (isMediumScreen ? '8px' : (isLargeScreen ? '8px' : (isExtraLargeScreen ? '8px' : '10px'))), paddingRight: isSmallScreen ? '6px' : (isMediumScreen ? '8px' : (isLargeScreen ? '8px' : (isExtraLargeScreen ? '8px' : '10px'))) }}
                        title="Watch Table"
                        onClick={() => {
                          if (player.activeGameId) {
                            onWatchGame(player.activeGameId as string);
                          } else {
                            // Fallback: dispatch event for GameId lookup handled in HomePage
                            window.dispatchEvent(new CustomEvent('watchUserGame', { detail: { userId: player.id } }));
                          }
                        }}
                      >
                        Watch
                      </button>
                    )}
                    {/* Hide action buttons for self */}
                    {user && player.id !== user.id && (
                        player.status === 'blocked' ? (
                        <>
                          <span className="text-slate-400 mr-2 flex items-center h-8" style={{ fontSize: `${12 * textScale}px` }}>unblock?</span>
                          <button className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-600 border border-slate-300 hover:bg-slate-500" title="Unblock"
                            onClick={() => onSetConfirmModal({ open: true, player, action: 'unblock_user' })}>
                            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                              <circle cx="12" cy="12" r="11" stroke="white" strokeWidth="2" />
                              <path d="M6 18L18 6" stroke="white" strokeWidth="2.5" />
                            </svg>
                          </button>
                        </>
                      ) : (
                        player.status === 'friend' ? (
                          <>
                            <button className="flex items-center justify-center rounded-full bg-red-600 border border-slate-300 hover:bg-red-700" title="Remove Friend"
                              style={{ width: isSmallScreen ? '28px' : (isMediumScreen ? '30px' : (isLargeScreen ? '31px' : (isExtraLargeScreen ? '31.5px' : '32px'))), height: isSmallScreen ? '28px' : (isMediumScreen ? '30px' : (isLargeScreen ? '31px' : (isExtraLargeScreen ? '31.5px' : '32px'))) }}
                              onClick={() => {
                                onSetConfirmModal({ open: true, player, action: 'remove_friend' });
                              }}>
                              <img src="/remove-friend.svg" alt="Remove Friend" style={{ width: isSmallScreen ? '16px' : (isMediumScreen ? '18px' : (isLargeScreen ? '19px' : (isExtraLargeScreen ? '19.5px' : '20px'))), height: isSmallScreen ? '16px' : (isMediumScreen ? '18px' : (isLargeScreen ? '19px' : (isExtraLargeScreen ? '19.5px' : '20px'))), filter: 'invert(1) brightness(2)' }} />
                            </button>
                            <button className="flex items-center justify-center rounded-full bg-slate-600 border border-slate-300 hover:bg-slate-500" title="Block"
                              style={{ width: isSmallScreen ? '28px' : (isMediumScreen ? '30px' : (isLargeScreen ? '31px' : (isExtraLargeScreen ? '31.5px' : '32px'))), height: isSmallScreen ? '28px' : (isMediumScreen ? '30px' : (isLargeScreen ? '31px' : (isExtraLargeScreen ? '31.5px' : '32px'))) }}
                              onClick={() => {
                                onSetConfirmModal({ open: true, player, action: 'block_user' });
                              }}>
                              <svg fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2" style={{ width: isSmallScreen ? '20px' : (isMediumScreen ? '24px' : (isLargeScreen ? '26px' : (isExtraLargeScreen ? '27px' : '28px'))), height: isSmallScreen ? '20px' : (isMediumScreen ? '24px' : (isLargeScreen ? '26px' : (isExtraLargeScreen ? '27px' : '28px'))) }}>
                                <circle cx="12" cy="12" r="11" stroke="white" strokeWidth="2" />
                                <path d="M4 4L20 20M20 4L4 20" stroke="white" strokeWidth="2.5" />
                              </svg>
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="flex items-center justify-center rounded-full bg-green-600 border border-slate-300 hover:bg-green-700" title="Add Friend"
                              style={{ width: isSmallScreen ? '28px' : (isMediumScreen ? '30px' : (isLargeScreen ? '31px' : (isExtraLargeScreen ? '31.5px' : '32px'))), height: isSmallScreen ? '28px' : (isMediumScreen ? '30px' : (isLargeScreen ? '31px' : (isExtraLargeScreen ? '31.5px' : '32px'))) }}
                              onClick={() => {
                                onSetConfirmModal({ open: true, player, action: 'add_friend' });
                              }}>
                              <img src="/add-friend.svg" alt="Add Friend" style={{ width: isSmallScreen ? '16px' : (isMediumScreen ? '18px' : (isLargeScreen ? '19px' : (isExtraLargeScreen ? '19.5px' : '20px'))), height: isSmallScreen ? '16px' : (isMediumScreen ? '18px' : (isLargeScreen ? '19px' : (isExtraLargeScreen ? '19.5px' : '20px'))), filter: 'invert(1) brightness(2)' }} />
                            </button>
                            <button className="flex items-center justify-center rounded-full bg-slate-600 border border-slate-300 hover:bg-slate-500" title="Block"
                              style={{ width: isSmallScreen ? '28px' : (isMediumScreen ? '30px' : (isLargeScreen ? '31px' : (isExtraLargeScreen ? '31.5px' : '32px'))), height: isSmallScreen ? '28px' : (isMediumScreen ? '30px' : (isLargeScreen ? '31px' : (isExtraLargeScreen ? '31.5px' : '32px'))) }}
                              onClick={() => {
                                onSetConfirmModal({ open: true, player, action: 'block_user' });
                              }}>
                              <svg fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2" style={{ width: isSmallScreen ? '20px' : (isMediumScreen ? '24px' : (isLargeScreen ? '26px' : (isExtraLargeScreen ? '27px' : '28px'))), height: isSmallScreen ? '20px' : (isMediumScreen ? '24px' : (isLargeScreen ? '26px' : (isExtraLargeScreen ? '27px' : '28px'))) }}>
                                <circle cx="12" cy="12" r="11" stroke="white" strokeWidth="2" />
                                <path d="M4 4L20 20M20 4L4 20" stroke="white" strokeWidth="2.5" />
                              </svg>
                            </button>
                          </>
                        )
                      )
                    )}
                  </div>
                </div>
              )) : (
                <div className="text-center text-slate-400 py-4" style={{ fontSize: `${14 * textScale}px` }}>No players found.</div>
              )}
            {Array.isArray(onlinePlayers) && onlinePlayers.length === 0 && (
              <div className="text-center text-slate-400 py-4" style={{ fontSize: `${14 * textScale}px` }}>No players found.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ChatSection;
