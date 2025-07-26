// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { onlineUsers } from '../index';
import { authenticateToken } from '../middleware/auth.middleware';
const router = Router();
const prisma = new PrismaClient();

// GET /api/users - return all users with online status and friend/block status
router.get('/', authenticateToken, async (req, res) => {
  const currentUserId = (req as any).user.userId;
  const users = await prisma.user.findMany({
    select: { id: true, username: true, avatar: true, coins: true }
  }) as any[];

  let friends: { friendId: string }[] = [], blockedUsers: { blockedId: string }[] = [];
  if (currentUserId) {
    friends = await prisma.friend.findMany({ where: { userId: currentUserId } });
    blockedUsers = await prisma.blockedUser.findMany({ where: { userId: currentUserId } });
  }

  // @ts-ignore
  const usersWithStatus = users.map(u => ({
    ...u,
    online: onlineUsers.has(u.id),
    status: friends.some(f => f.friendId === u.id)
      ? 'friend'
      : blockedUsers.some(b => b.blockedId === u.id)
      ? 'blocked'
      : 'not_friend'
  }));

  res.json(usersWithStatus);
});

// GET /api/users/:id/stats - return all UserStats for a user
router.get('/:id/stats', async (req, res) => {
  const userId = req.params.id;
  const stats = await prisma.userStats.findMany({
    where: { userId }
  });
  res.json(stats);
});

export default router; 