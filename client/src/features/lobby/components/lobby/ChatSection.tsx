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
  user: any;
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
  return (
    <div
      className={
        'bg-slate-800 rounded-lg flex flex-col h-[calc(100vh-64px-32px)] p-4 ' +
        (mobileTab !== 'chat' ? 'hidden md:flex' : 'flex')
      }
    >
      {/* Chat/Players Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            className={`w-20 h-10 flex items-center justify-center rounded-md text-sm font-semibold transition ${activeChatTab === 'chat' ? 'bg-indigo-600' : 'bg-slate-700'}`}
            onClick={() => onSetActiveChatTab('chat')}
            aria-label="Chat"
          >
            <img src="/chat.svg" alt="Chat" className="w-6 h-6" style={{ filter: 'invert(1) brightness(2)' }} />
          </button>
          <button
            className={`w-20 h-10 flex items-center justify-center rounded-md text-sm font-semibold transition ${activeChatTab === 'players' ? 'bg-indigo-600' : 'bg-slate-700'}`}
            onClick={() => onSetActiveChatTab('players')}
            aria-label="Players"
          >
            <img src="/players.svg" alt="Players" className="w-6 h-6" style={{ filter: 'invert(1) brightness(2)' }} />
          </button>
        </div>
        <div className="flex items-center space-x-1">
          <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
          <span className="text-slate-300 text-sm font-medium">{onlineCount} online</span>
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
                  <span className="text-orange-400 italic flex items-center justify-center gap-1">
                    {msg.message}
                  </span>
                </div>
              ) : (
                <div
                  key={msg.id || index}
                  className={`mb-2 flex items-start ${msg.userId === user.id ? 'justify-end' : ''}`}
                >
                  {msg.userId !== user.id && (
                    <div className={`w-8 h-8 mr-2 rounded-full overflow-hidden flex-shrink-0`}>
                      <img 
                        src={getUserAvatar(msg.userId)} 
                        alt={msg.userName || ''} 
                        width={32}
                        height={32}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className={`max-w-[80%] ${msg.userId === user.id ? 'bg-blue-600 text-white' : 'bg-gray-700 text-white'} rounded-lg px-3 py-2`}>
                    <div className="flex justify-between items-center mb-1">
                      {msg.userId !== user.id && (
                        <span className="font-medium text-xs opacity-80">{msg.userName}</span>
                      )}
                      <span className="text-xs opacity-75 ml-auto"> {formatTime(msg.timestamp)}</span>
                    </div>
                    <p>{msg.message}</p>
                  </div>
                  {msg.userId === user.id && (
                    <div className={`w-8 h-8 ml-2 rounded-full overflow-hidden flex-shrink-0`}>
                      <img 
                        src={user.avatarUrl || getUserAvatar(msg.userId)} 
                        alt={msg.userName || ''} 
                        width={32}
                        height={32}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>
              )
            ))}
            {chatMessages.length === 0 && (
              <div className="text-center text-slate-400 py-4">
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
                placeholder="Type a message..."
                className="flex-1 min-w-0 bg-slate-700 text-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10"
                ref={inputRef}
              />
              {/* Emoji Picker Button */}
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  className="flex items-center justify-center w-10 h-10 rounded-md hover:bg-slate-600 transition"
                  onClick={() => onSetShowEmojiPicker(!showEmojiPicker)}
                  tabIndex={-1}
                >
                  <span role="img" aria-label="emoji" className="text-2xl">😊</span>
                </button>
                {/* Emoji Picker Dropdown */}
                {showEmojiPicker && (
                  <div className="absolute right-0 bottom-12 z-50">
                    <Picker data={data} onEmojiSelect={onSelectEmoji} theme="dark" />
                  </div>
                )}
              </div>
              {/* Send Button as Icon (right-pointing) */}
              <button
                type="submit"
                className="w-10 h-10 flex items-center justify-center rounded-md bg-indigo-600 hover:bg-indigo-700 transition flex-shrink-0"
                aria-label="Send"
              >
                {/* Right-pointing paper plane icon */}
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l16 8-16 8 4-8z" />
                </svg>
              </button>
            </div>
          </form>
        </>
      ) : (
        <>
          {/* Friends summary row */}
          <div className="bg-indigo-900 rounded mb-2 px-6 py-2 flex flex-col justify-center" style={{ minHeight: '64px' }}>
            <div className="flex items-center justify-between h-8">
              <span className="flex items-center gap-2 text-slate-200 text-lg font-bold">
                <img src="/friend.svg" alt="Friends" className="w-8 h-8" style={{ filter: 'invert(1) brightness(2)' }} />
                Friends: {Array.isArray(onlinePlayers) ? onlinePlayers.filter(p => p.status === 'friend').length : 0}
              </span>
              <span className="flex items-center gap-1 text-slate-300 text-sm font-medium">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                {Array.isArray(onlinePlayers) ? onlinePlayers.filter(p => p.status === 'friend' && p.online).length : 0} Online
              </span>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <label className="flex items-center gap-1 cursor-pointer text-slate-300 text-sm">
                <input
                  type="radio"
                  name="playerFilter"
                  value="all"
                  checked={playerFilter === 'all'}
                  onChange={() => onSetPlayerFilter('all')}
                  className="accent-indigo-600"
                />
                All
              </label>
              <label className="flex items-center gap-1 cursor-pointer text-slate-300 text-sm">
                <input
                  type="radio"
                  name="playerFilter"
                  value="friends"
                  checked={playerFilter === 'friends'}
                  onChange={() => onSetPlayerFilter('friends')}
                  className="accent-indigo-600"
                />
                Friends
              </label>
              <label className="flex items-center gap-1 cursor-pointer text-slate-300 text-sm">
                <input
                  type="radio"
                  name="playerFilter"
                  value="hide-blocked"
                  checked={playerFilter === 'hide-blocked'}
                  onChange={() => onSetPlayerFilter('hide-blocked')}
                  className="accent-indigo-600"
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
                <div key={player.id} className="flex items-center gap-3 p-2 rounded bg-slate-700">
                  <img src={isPlayer(player) ? (player.avatarUrl || '/default-pfp.jpg') : isBot(player) ? (player.avatar || '/bot-avatar.jpg') : '/bot-avatar.jpg'} alt="" className="w-8 h-8 rounded-full border-2 border-slate-600" />
                  <span
                    className={`text-sm font-medium ${player.online ? 'text-green-400' : 'text-slate-300'} flex items-center cursor-pointer hover:underline`}
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
                    {player.activeGameId && player.id !== user.id && (
                      <button
                        className="px-2 h-8 flex items-center justify-center rounded-full bg-indigo-600 text-white text-xs border border-slate-300 hover:bg-indigo-700"
                        title="Watch Table"
                        onClick={() => onWatchGame(player.activeGameId as string)}
                      >
                        Watch
                      </button>
                    )}
                    {/* Hide action buttons for self */}
                    {player.id !== user.id && (
                      player.status === 'blocked' ? (
                        <>
                          <span className="text-slate-400 text-xs mr-2 flex items-center h-8">unblock?</span>
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
                            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-red-600 border border-slate-300 hover:bg-red-700" title="Remove Friend"
                              onClick={() => {
                                onSetConfirmModal({ open: true, player, action: 'remove_friend' });
                              }}>
                              <img src="/remove-friend.svg" alt="Remove Friend" className="w-5 h-5" style={{ filter: 'invert(1) brightness(2)' }} />
                            </button>
                            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-600 border border-slate-300 hover:bg-slate-500" title="Block"
                              onClick={() => {
                                onSetConfirmModal({ open: true, player, action: 'block_user' });
                              }}>
                              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                                <circle cx="12" cy="12" r="11" stroke="white" strokeWidth="2" />
                                <path d="M4 4L20 20M20 4L4 20" stroke="white" strokeWidth="2.5" />
                              </svg>
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-green-600 border border-slate-300 hover:bg-green-700" title="Add Friend"
                              onClick={() => {
                                onSetConfirmModal({ open: true, player, action: 'add_friend' });
                              }}>
                              <img src="/add-friend.svg" alt="Add Friend" className="w-5 h-5" style={{ filter: 'invert(1) brightness(2)' }} />
                            </button>
                            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-600 border border-slate-300 hover:bg-slate-500" title="Block"
                              onClick={() => {
                                onSetConfirmModal({ open: true, player, action: 'block_user' });
                              }}>
                              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
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
                <div className="text-center text-slate-400 py-4">No players found.</div>
              )}
            {Array.isArray(onlinePlayers) && onlinePlayers.length === 0 && (
              <div className="text-center text-slate-400 py-4">No players found.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ChatSection;
