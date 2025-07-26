import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { io } from '../index';
import { authenticateToken } from '../middleware/auth.middleware';
const router = Router();
const prisma = new PrismaClient();

// Add Friend
router.post('/friends/add', authenticateToken, async (req, res) => {
  const currentUserId = (req as any).user.userId;
  const { friendId } = req.body;
  if (currentUserId === friendId) return res.status(400).json({ error: "Cannot add yourself as a friend." });
  try {
    await prisma.friend.create({
      data: { userId: currentUserId, friendId }
    });
    // Emit socket event to both users
    io.to(currentUserId).emit('friendAdded', { friendId });
    io.to(friendId).emit('friendAdded', { userId: currentUserId });
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
router.post('/friends/remove', authenticateToken, async (req, res) => {
  const currentUserId = (req as any).user.userId;
  const { friendId } = req.body;
  try {
    await prisma.friend.delete({
      where: { userId_friendId: { userId: currentUserId, friendId } }
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
router.post('/block', authenticateToken, async (req, res) => {
  const currentUserId = (req as any).user.userId;
  const { blockId } = req.body;
  if (currentUserId === blockId) return res.status(400).json({ error: "Cannot block yourself." });
  // Remove from friends if currently a friend
  await prisma.friend.deleteMany({ where: { userId: currentUserId, friendId: blockId } });
  // Add to BlockedUser table
  await prisma.blockedUser.create({
    data: { userId: currentUserId, blockedId: blockId }
  });
  // Emit socket events for real-time update
  io.to(currentUserId).emit('friendAdded', { friendId: blockId }); // triggers UI refresh
  io.to(currentUserId).emit('blockedUser', { blockId });
  res.json({ success: true });
});

// Unblock User
router.post('/unblock', authenticateToken, async (req, res) => {
  const currentUserId = (req as any).user.userId;
  const { blockId } = req.body;
  await prisma.blockedUser.deleteMany({
    where: { userId: currentUserId, blockedId: blockId }
  });
  // Emit socket event for real-time update
  io.to(currentUserId).emit('blockedUser', { blockId });
  res.json({ success: true });
});

export default router; 