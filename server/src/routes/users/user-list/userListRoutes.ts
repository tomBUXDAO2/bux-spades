// @ts-nocheck
import { Router } from 'express';
import { prisma } from '../../../lib/prisma';
import { onlineUsers } from '../../../index';
import { requireAuth } from '../../../middleware/auth.middleware';

const router = Router();

// GET /api/users - return all users with online status and friend/block status
router.get('/', requireAuth, async (req, res) => {
  const currentUserId = (req as any).user.id;
  
  // Get users from NEW DB only
  const users = await prisma.user.findMany({
    select: { id: true, username: true, avatarUrl: true, coins: true }
  }) as any[];

  // Get friends and blocked users from NEW DB
  const [friends, blockedUsers] = await Promise.all([
    prisma.friend.findMany({
      where: { userId: currentUserId },
      select: { friendId: true }
    }),
    prisma.blockedUser.findMany({
      where: { userId: currentUserId },
      select: { blockedId: true }
    })
  ]);

  // For each user, determine their currently active game (WAITING or PLAYING) from NEW DB
  const userIds = users.map(u => u.id);
  
  // Get active game memberships
  const activeMemberships = await prisma.gamePlayer.findMany({
    where: {
      userId: { in: userIds },
      leftAt: null // Still active in game
    },
    select: { userId: true, gameId: true }
  });
  
  // Get the game statuses for these games
  const gameIds = activeMemberships.map(m => m.gameId);
  const activeGames = await prisma.game.findMany({
    where: {
      id: { in: gameIds },
      status: { in: ['WAITING', 'BIDDING', 'PLAYING'] as any }
    },
    select: { id: true }
  });
  
  const activeGameIds = new Set(activeGames.map(g => g.id));
  
  const userIdToActiveGameId: Record<string, string> = {};
  for (const m of activeMemberships) {
    if (activeGameIds.has(m.gameId)) {
      userIdToActiveGameId[m.userId] = m.gameId;
    }
  }

  // @ts-ignore
  const usersWithStatus = users.map(u => ({
    ...u,
    avatarUrl: u.avatarUrl, // Map avatarUrl to avatar for compatibility
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
