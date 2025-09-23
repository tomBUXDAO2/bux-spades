// @ts-nocheck
import { Router } from 'express';
import { prismaNew } from '../../../newdb/client';
import { onlineUsers } from '../../../index';
import { requireAuth } from '../../../middleware/auth.middleware';

const router = Router();

// GET /api/users - return all users with online status and friend/block status
router.get('/', requireAuth, async (req, res) => {
  const currentUserId = (req as any).user.id;
  
  // Get users from NEW DB only
  const users = await prismaNew.user.findMany({
    select: { id: true, username: true, avatarUrl: true, coins: true }
  }) as any[];

  // For now, no friends/blocked functionality in new DB
  let friends: { friendId: string }[] = [], blockedUsers: { blockedId: string }[] = [];

  // For each user, determine their currently active game (WAITING or PLAYING) from NEW DB
  const userIds = users.map(u => u.id);
  const activeMemberships = await prismaNew.gamePlayer.findMany({
    where: {
      userId: { in: userIds },
      leftAt: null, // Still active in game
      game: { 
        status: { in: ['WAITING', 'BIDDING', 'PLAYING'] as any }
      }
    },
    select: { userId: true, gameId: true }
  });
  
  const userIdToActiveGameId: Record<string, string> = {};
  for (const m of activeMemberships) {
    // Prefer the most recent assignment if multiple (rare); last write wins is fine here
    userIdToActiveGameId[m.userId] = m.gameId;
  }

  // @ts-ignore
  const usersWithStatus = users.map(u => ({
    ...u,
    avatar: u.avatarUrl, // Map avatarUrl to avatar for compatibility
    online: onlineUsers.has(u.id),
    status: friends.some(f => f.friendId === u.id)
      ? 'friend'
      : blockedUsers.some(b => b.blockedId === u.id)
      ? 'blocked'
      : 'not_friend',
    activeGameId: userIdToActiveGameId[u.id] || null
  }));

  res.json(usersWithStatus);
});

export default router;
