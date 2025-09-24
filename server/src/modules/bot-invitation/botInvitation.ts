import type { Game } from '../../types/game';
import { io } from '../../index';
import { enrichGameForClient } from '../../routes/games/shared/gameUtils';
import prisma from '../../lib/prisma';
import { prismaNew } from '../../newdb/client';
import { newdbUpsertGamePlayer } from '../../newdb/writers';
import { useNewDbOnly } from '../../newdb/toggle';

// Single bot user ID for all bots
const BOT_USER_ID = 'bot-user-universal';

/**
 * Ensures the universal bot user exists in the database
 */
async function ensureBotUserExists(): Promise<void> {
  try {
    await prisma.user.upsert({
      where: { id: BOT_USER_ID },
      update: {},
      create: {
        id: BOT_USER_ID,
        username: 'Bot Player',
        avatar: '/bot-avatar.jpg',
        discordId: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('[BOT INVITATION] Failed to ensure bot user exists:', error);
  }
}

/**
 * Adds a bot to a specific seat in a game
 */
export async function addBotToSeat(game: Game, seatIndex: number): Promise<void> {
  console.log(`[BOT INVITATION] Adding bot to seat ${seatIndex} in game ${game.id}`);
  
  // Check if seat is empty
  if (game.players[seatIndex] !== null) {
    console.log(`[BOT INVITATION] Seat ${seatIndex} is not empty`);
    return;
  }
  
  // Create bot with unique display name and ID
  const botDisplayId = `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  let baseNumber = Math.floor(Math.random() * 1000);
  let botUsername = `Bot ${baseNumber}`;

  // Try upsert with retries to avoid username collisions
  let retries = 3;
  while (retries > 0) {
    try {
      await prisma.user.upsert({
        where: { id: botDisplayId },
        update: {},
        create: {
          id: botDisplayId,
          username: botUsername,
          avatar: '/bot-avatar.jpg',
          discordId: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
      break; // success
    } catch (err: any) {
      if (err?.code === 'P2002' && Array.isArray(err?.meta?.target) && err.meta.target.includes('username')) {
        // Username collision: change username and retry
        baseNumber = Math.floor(Math.random() * 1000);
        botUsername = `Bot ${baseNumber}-${Math.random().toString(36).slice(-3)}`;
        retries--;
        if (retries === 0) throw err;
      } else {
        throw err;
      }
    }
  }

  game.players[seatIndex] = {
    id: botDisplayId,
    username: botUsername,
    avatar: '/bot-avatar.jpg',
    type: 'bot',
    position: seatIndex,
    team: seatIndex % 2,
    bid: undefined,
    tricks: 0,
    points: 0,
  };
  
  // If game exists in new DB, upsert GamePlayer row for this bot as well (dual-write)
  try {
    await newdbUpsertGamePlayer({
      gameId: game.id,
      userId: botDisplayId,
      seatIndex,
      teamIndex: game.gameMode === 'PARTNERS' ? (seatIndex % 2) : null,
      isHuman: false,
    });
  } catch (err) {
    console.error('[BOT INVITATION] Failed to upsert newdb GamePlayer for bot seat:', err);
  }
  
  // If game is already in old DB, upsert GamePlayer row for this bot
  try {
    if (!useNewDbOnly && game.dbGameId) {
      await prisma.gamePlayer.upsert({
        where: { gameId_position: { gameId: game.dbGameId, position: seatIndex } as any },
        update: {
          userId: botDisplayId,
          team: game.gameMode === 'PARTNERS' ? (seatIndex === 0 || seatIndex === 2 ? 1 : 2) : null,
          username: botUsername,
          updatedAt: new Date()
        },
        create: {
          id: `player_${game.dbGameId}_${seatIndex}_${Date.now()}`,
          gameId: game.dbGameId,
          userId: botDisplayId,
          position: seatIndex,
          team: game.gameMode === 'PARTNERS' ? (seatIndex === 0 || seatIndex === 2 ? 1 : 2) : null,
          bid: null,
          bags: 0,
          points: 0,
          username: botUsername,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
    }
  } catch (err) {
    console.error('[BOT INVITATION] Failed to upsert GamePlayer for bot seat:', err);
  }
  
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
