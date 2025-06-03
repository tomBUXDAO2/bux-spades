import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();
const prisma = new PrismaClient();

// Add Friend
router.post('/friends/add', async (req, res) => {
  const { userId, friendId } = req.body;
  if (userId === friendId) return res.status(400).json({ error: "Cannot add yourself as a friend." });
  try {
    await prisma.friend.create({
      data: { userId, friendId }
    });
    res.json({ success: true });
  } catch (error) {
    const err = error as any;
    if (err.code === 'P2002') {
      // Unique constraint failed (already friends)
      res.status(409).json({ error: "Already added as a friend." });
    } else if (err.code === 'P2003') {
      // Foreign key constraint failed (user or friend does not exist)
      res.status(404).json({ error: "User or friend not found." });
    } else {
      res.status(500).json({ error: "Failed to add friend." });
    }
  }
});

// Remove Friend
router.post('/friends/remove', async (req, res) => {
  const { userId, friendId } = req.body;
  try {
    await prisma.friend.delete({
      where: { userId_friendId: { userId, friendId } }
    });
    res.json({ success: true });
  } catch (error) {
    const err = error as any;
    if (err.code === 'P2025') {
      // Record not found
      res.status(404).json({ error: "Friend relationship not found." });
    } else {
      res.status(500).json({ error: "Failed to remove friend." });
    }
  }
});

// Block User
router.post('/block', async (req, res) => {
  const { userId, blockId } = req.body;
  if (userId === blockId) return res.status(400).json({ error: "Cannot block yourself." });
  await prisma.user.update({
    where: { id: userId },
    data: { blockedUsers: { connect: { id: blockId } } }
  });
  res.json({ success: true });
});

// Unblock User
router.post('/unblock', async (req, res) => {
  const { userId, blockId } = req.body;
  await prisma.user.update({
    where: { id: userId },
    data: { blockedUsers: { disconnect: { id: blockId } } }
  });
  res.json({ success: true });
});

export default router; 