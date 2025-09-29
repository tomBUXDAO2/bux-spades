import { prisma } from '../../lib/prisma';
import type { Game } from '../../types/game';

/**
 * Create a bot player for a game
 */
export async function createBotPlayer(game: Game, seatIndex: number): Promise<any> {
  try {
    console.log(`[BOT INVITATION] Creating bot player for seat ${seatIndex} in game ${game.id}`);
    
    // Generate unique bot display ID
    let baseNumber = Math.floor(Math.random() * 1000);
    let botDisplayId = `bot_${baseNumber}`;
    
    // Try upsert with retries to avoid username collisions
    let retries = 3;
    while (retries > 0) {
      try {
        await prisma.user.upsert({
          where: { id: botDisplayId },
          update: {},
          create: {
            id: botDisplayId,
            username: `Bot${baseNumber}`,
            avatarUrl: '/bot-avatar.jpg',
            discordId: null,
            coins: 1000000,
            createdAt: new Date()
          }
        });  
        break; // success
      } catch (err: any) {
        if (err?.code === 'P2002' && Array.isArray(err?.meta?.target) && err.meta.target.includes('username')) {
          // Username collision: change username and retry
          baseNumber = Math.floor(Math.random() * 1000);
          botDisplayId = `bot_${baseNumber}`;
          retries--;
          if (retries === 0) throw err;
        } else {
          throw err;
        }
      }
    }
    
    // Create bot player object
    const botPlayer = {
      id: botDisplayId,
      username: `Bot${baseNumber}`,
      type: 'bot' as const,
      position: seatIndex,
      team: seatIndex % 2,
      hand: [] as any[],
      bid: 0,
      tricks: 0,
      points: 0,
      nil: false,
      blindNil: false,
      connected: true
    };
    
    console.log(`[BOT INVITATION] Created bot player:`, botPlayer);
    return botPlayer;
    
  } catch (error) {
    console.error(`[BOT INVITATION] Error creating bot player:`, error);
    throw error;
  }
}

/**
 * Add bot player to game
 */
export async function addBotToGame(game: Game, seatIndex: number): Promise<void> {
  try {
    console.log(`[BOT INVITATION] Adding bot to seat ${seatIndex} in game ${game.id}`);
    
    // Create bot player
    const botPlayer = await createBotPlayer(game, seatIndex);
    
    // Add bot to game players array
    if (game.players) {
      game.players[seatIndex] = botPlayer;
    }
    
    // Create game player record in database
    if (game.dbGameId) {
      await prisma.gamePlayer.create({
        data: {
          gameId: game.dbGameId,
          userId: botPlayer.id,
          seatIndex: seatIndex,
          teamIndex: botPlayer.team,
          isHuman: false,
          joinedAt: new Date(),
          leftAt: new Date()
        }
      });
    }
    
    console.log(`[BOT INVITATION] Successfully added bot to game ${game.id}`);
    
  } catch (error) {
    console.error(`[BOT INVITATION] Error adding bot to game:`, error);
    throw error;
  }
}

/**
 * Remove bot player from game
 */
export async function removeBotFromGame(game: Game, seatIndex: number): Promise<void> {
  try {
    console.log(`[BOT INVITATION] Removing bot from seat ${seatIndex} in game ${game.id}`);
    
    // Remove bot from game players array
    if (game.players && game.players[seatIndex]) {
      const botPlayer = game.players[seatIndex];
      game.players[seatIndex] = null;
      
      // Remove game player record from database
      if (game.dbGameId) {
        await prisma.gamePlayer.deleteMany({
          where: {
            gameId: game.dbGameId,
            userId: botPlayer.id
          }
        });
      }
    }
    
    console.log(`[BOT INVITATION] Successfully removed bot from game ${game.id}`);
    
  } catch (error) {
    console.error(`[BOT INVITATION] Error removing bot from game:`, error);
    throw error;
  }
}

/**
 * Check if a seat is available for a bot
 */
export function isSeatAvailableForBot(game: Game, seatIndex: number): boolean {
  if (!game.players || seatIndex < 0 || seatIndex >= 4) {
    return false;
  }
  
  const player = game.players[seatIndex];
  return player === null || player === undefined;
}

/**
 * Get available seats for bots
 */
export function getAvailableSeatsForBots(game: Game): number[] {
  if (!game.players) {
    return [];
  }
  
  const availableSeats: number[] = [];
  for (let i = 0; i < 4; i++) {
    if (isSeatAvailableForBot(game, i)) {
      availableSeats.push(i);
    }
  }
  
  return availableSeats;
}

/**
 * Fill empty seats with bots
 */
export async function fillEmptySeatsWithBots(game: Game): Promise<void> {
  try {
    console.log(`[BOT INVITATION] Filling empty seats with bots for game ${game.id}`);
    
    const availableSeats = getAvailableSeatsForBots(game);
    console.log(`[BOT INVITATION] Available seats:`, availableSeats);
    
    for (const seatIndex of availableSeats) {
      await addBotToGame(game, seatIndex);
    }
    
    console.log(`[BOT INVITATION] Successfully filled ${availableSeats.length} empty seats with bots`);
    
  } catch (error) {
    console.error(`[BOT INVITATION] Error filling empty seats with bots:`, error);
    throw error;
  }
}

/**
 * Add bot to specific seat (alias for addBotToGame)
 */
export async function addBotToSeat(game: Game, seatIndex: number): Promise<void> {
  return await addBotToGame(game, seatIndex);
}
