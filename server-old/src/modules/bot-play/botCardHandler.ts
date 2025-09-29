import type { Game } from '../../types/game';
import { handlePlayCard } from '../socket-handlers/game-play/card-play/cardPlayHandler';

/**
 * Handles bot card playing using the proper card play handler
 */
export async function handleBotCardPlay(game: Game, userId: string, card: any): Promise<void> {
  console.log('[BOT CARD] Processing bot card play:', { gameId: game.id, userId, card: `${card.rank}${card.suit}` });

  // Use the proper card play handler to ensure turn advancement
  await handlePlayCard(
    { emit: () => {}, isAuthenticated: true, userId } as any, 
    { gameId: game.id, userId, card }
  );
}
