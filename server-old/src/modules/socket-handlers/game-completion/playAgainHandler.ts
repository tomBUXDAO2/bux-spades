import type { AuthenticatedSocket } from '../../socket-auth';
import { handlePlayAgain } from '../../play-again/playAgainManager';

/**
 * Handles play_again socket event
 */
export async function handlePlayAgainSocket(socket: AuthenticatedSocket, data: { gameId: string }): Promise<void> {
  await handlePlayAgain(socket, data);
}
