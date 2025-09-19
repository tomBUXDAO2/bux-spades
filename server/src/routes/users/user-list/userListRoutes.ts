// @ts-nocheck
import { Router } from 'express';
import prisma from '../../../lib/prisma';
import { onlineUsers } from '../../../index';
import { requireAuth } from '../../../middleware/auth.middleware';

const router = Router();

// GET /api/users - return all users with online status and friend/block status
router.get('/', requireAuth, async (req, res) => {
  const currentUserId = (req as any).user.id;
  const users = await prisma.user.findMany({
    select: { id: true, username: true, avatar: true, coins: true }
  }) as any[];

  let friends: { friendId: string }[] = [], blockedUsers: { blockedId: string }[] = [];
  if (currentUserId) {
    friends = await prisma.friend.findMany({ where: { userId: currentUserId } });
    blockedUsers = await prisma.blockedUser.findMany({ where: { userId: currentUserId } });
  }

  // For each user, determine their currently active game (WAITING or PLAYING)
  // We use the GamePlayer relation to locate any active games and surface the Game.id as activeGameId
  const userIds = users.map(u => u.id);
  const activeMemberships = await prisma.gamePlayer.findMany({
    where: {
      userId: { in: userIds },
      Game: { status: { in: ['WAITING', 'PLAYING'] } }
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
