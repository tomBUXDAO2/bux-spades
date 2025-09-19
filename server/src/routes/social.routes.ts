import { randomUUID } from 'crypto';
import { Router } from 'express';
import prisma from '../lib/prisma';
import { io } from '../index';
import { requireAuth } from '../middleware/auth.middleware';
const router = Router();

// Add Friend
router.post('/friends/add', requireAuth, async (req, res) => {
  const currentUserId = (req as any).user.id;
  const { friendId } = req.body;
  if (currentUserId === friendId) return res.status(400).json({ error: "Cannot add yourself as a friend." });
  try {
    await prisma.friend.create({
      data: { id: randomUUID(), userId: currentUserId, friendId, updatedAt: new Date() } as any
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
router.post('/friends/remove', requireAuth, async (req, res) => {
  const currentUserId = (req as any).user.id;
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
router.post('/block', requireAuth, async (req, res) => {
  const currentUserId = (req as any).user.id;
  const { blockId } = req.body;
  if (currentUserId === blockId) return res.status(400).json({ error: "Cannot block yourself." });
  try {
    // Remove from friends if currently a friend
    await prisma.friend.deleteMany({ where: { userId: currentUserId, friendId: blockId } });
    // Add to BlockedUser table
    await prisma.blockedUser.create({
      data: { id: randomUUID(), userId: currentUserId, blockedId: blockId, updatedAt: new Date() } as any
    });
    // Emit socket events for real-time update
    io.to(currentUserId).emit('friendAdded', { friendId: blockId }); // triggers UI refresh
    io.to(currentUserId).emit('blockedUser', { blockId });
    res.json({ success: true });
  } catch (error) {
    console.error('Error blocking user:', error);
    res.status(500).json({ error: "Failed to block user." });
  }
});

// Unblock User
router.post('/unblock', requireAuth, async (req, res) => {
  const currentUserId = (req as any).user.id;
  const { blockId } = req.body;
  try {
    await prisma.blockedUser.deleteMany({
      where: { userId: currentUserId, blockedId: blockId }
    });
    // Emit socket event for real-time update
    io.to(currentUserId).emit('blockedUser', { blockId });
    res.json({ success: true });
  } catch (error) {
    console.error('Error unblocking user:', error);
    res.status(500).json({ error: "Failed to unblock user." });
  }
});

export default router;
