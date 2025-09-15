import type { Game } from '../../types/game';
import { io } from '../../index';
import { enrichGameForClient } from '../../routes/games/shared/gameUtils';

/**
 * Adds a bot to a specific seat in a game
 */
export function addBotToSeat(game: Game, seatIndex: number): void {
  console.log(`[BOT INVITATION] Adding bot to seat ${seatIndex} in game ${game.id}`);
  
  // Check if seat is empty
  if (game.players[seatIndex] !== null) {
    console.log(`[BOT INVITATION] Seat ${seatIndex} is not empty`);
    return;
  }
  
  // Create bot
  const botId = `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const botNumber = Math.floor(Math.random() * 1000);
  
  game.players[seatIndex] = {
    id: botId,
    username: `Bot ${botNumber}`,
    avatar: '/bot-avatar.jpg',
    type: 'bot',
    position: seatIndex,
    team: seatIndex % 2,
    bid: undefined,
    tricks: 0,
    points: 0,
  };
  
  // Set isBotGame flag
  game.isBotGame = game.players.some(p => p && p.type === 'bot');
  
  // Send system message via chat
  const systemMessage = {
    id: `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId: 'system',
    userName: 'System',
    message: `A bot was invited to seat ${seatIndex + 1}.`,
    timestamp: Date.now(),
    isGameMessage: true
  };
  
  // Emit chat message
  io.to(game.id).emit('chat_message', { gameId: game.id, message: systemMessage });
  
  // Update all clients
  const enrichedGame = enrichGameForClient(game);
  console.log(`[BOT INVITATION] Emitting game_update after bot addition:`, {
    gameId: game.id,
    players: enrichedGame.players.map((p: any, i: number) => `${i}: ${p ? `${p.username} (${p.type})` : 'null'}`)
  });
  io.to(game.id).emit('game_update', enrichedGame);
  
  console.log(`[BOT INVITATION] Bot added to seat ${seatIndex} in game ${game.id}`);
}
