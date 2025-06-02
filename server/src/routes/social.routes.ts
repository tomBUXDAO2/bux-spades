import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();
const prisma = new PrismaClient();

// Add Friend
router.post('/friends/add', async (req, res) => {
  const { userId, friendId } = req.body;
  if (userId === friendId) return res.status(400).json({ error: "Cannot add yourself as a friend." });
  await prisma.user.update({
    where: { id: userId },
    data: { friends: { connect: { id: friendId } } }
  });
  res.json({ success: true });
});

// Remove Friend
router.post('/friends/remove', async (req, res) => {
  const { userId, friendId } = req.body;
  await prisma.user.update({
    where: { id: userId },
    data: { friends: { disconnect: { id: friendId } } }
  });
  res.json({ success: true });
});

// Block User
router.post('/block', async (req, res) => {
  const { userId, blockId } = req.body;
  if (userId === blockId) return res.status(400).json({ error: "Cannot block yourself." });
  await prisma.user.update({
    where: { id: userId },
    data: { blocked: { connect: { id: blockId } } }
  });
  res.json({ success: true });
});

// Unblock User
router.post('/unblock', async (req, res) => {
  const { userId, blockId } = req.body;
  await prisma.user.update({
    where: { id: userId },
    data: { blocked: { disconnect: { id: blockId } } }
  });
  res.json({ success: true });
});

export default router; 