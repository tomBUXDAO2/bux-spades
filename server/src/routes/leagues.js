import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { authenticateToken } from '../middleware/auth.js';
import { LeagueService } from '../services/LeagueService.js';
import { LeagueWalletService } from '../services/LeagueWalletService.js';
import { GameService } from '../services/GameService.js';
import { prisma } from '../config/databaseFirst.js';
import { io } from '../config/server.js';
import { LeagueChatHandler } from '../modules/socket-handlers/lobby/leagueChatHandler.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, '../uploads');
const leagueLogoDir = path.join(uploadsRoot, 'leagues');

if (!fs.existsSync(leagueLogoDir)) {
  fs.mkdirSync(leagueLogoDir, { recursive: true });
}

const logoStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, leagueLogoDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `league-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PNG, JPEG, and WebP images are allowed'));
  }
});

function handleError(res, error, fallback = 'League request failed') {
  const status = error.status || 500;
  if (status >= 500) console.error('[LEAGUES]', error);
  return res.status(status).json({ error: error.message || fallback });
}

// List leagues for Rooms tab
router.get('/', authenticateToken, async (req, res) => {
  try {
    const data = await LeagueService.listLeaguesForUser(req.userId);
    res.json(data);
  } catch (error) {
    handleError(res, error);
  }
});

// Create-league requests (FB users) — must be before /:leagueId
router.post('/create-requests', authenticateToken, logoUpload.single('logo'), async (req, res) => {
  try {
    let logoUrl = req.body.logoUrl || null;
    if (req.file) {
      const relativePath = `/uploads/leagues/${req.file.filename}`;
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      logoUrl = host ? `${protocol}://${host}${relativePath}` : relativePath;
    }
    const requireJoinApproval = !(
      req.body.requireJoinApproval === 'false' ||
      req.body.requireJoinApproval === false ||
      req.body.requireJoinApproval === '0'
    );
    const request = await LeagueService.submitCreateRequest({
      requesterId: req.userId,
      name: req.body.name,
      logoUrl,
      bgColor: req.body.bgColor,
      requireJoinApproval
    });
    res.status(201).json(request);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/:leagueId', authenticateToken, async (req, res) => {
  try {
    const league = await LeagueService.getLeague(req.params.leagueId, req.userId);
    res.json(league);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/:leagueId/join-requests', authenticateToken, async (req, res) => {
  try {
    const request = await LeagueService.requestJoin(req.params.leagueId, req.userId);
    try {
      io.to(`league_admins_${req.params.leagueId}`).emit('league_join_request', {
        leagueId: req.params.leagueId,
        request
      });
    } catch (_) {
      /* ignore socket emit errors */
    }
    res.status(201).json(request);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/:leagueId/join-requests', authenticateToken, async (req, res) => {
  try {
    const requests = await LeagueService.listJoinRequests(req.params.leagueId, req.userId);
    res.json(requests);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/:leagueId/join-requests/:requestId/approve', authenticateToken, async (req, res) => {
  try {
    const result = await LeagueService.approveJoinRequest(
      req.params.leagueId,
      req.params.requestId,
      req.userId
    );
    io.to(`league_${req.params.leagueId}`).emit('league_membership_updated', {
      leagueId: req.params.leagueId,
      userId: result.userId,
      action: 'approved'
    });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/:leagueId/join-requests/:requestId/reject', authenticateToken, async (req, res) => {
  try {
    const result = await LeagueService.rejectJoinRequest(
      req.params.leagueId,
      req.params.requestId,
      req.userId
    );
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/:leagueId/members', authenticateToken, async (req, res) => {
  try {
    const members = await LeagueService.listMembers(req.params.leagueId, req.userId);
    res.json(members);
  } catch (error) {
    handleError(res, error);
  }
});

router.patch('/:leagueId/members/:userId/role', authenticateToken, async (req, res) => {
  try {
    const member = await LeagueService.setMemberRole(
      req.params.leagueId,
      req.userId,
      req.params.userId,
      req.body.role
    );
    res.json(member);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/:leagueId/members/:userId/mute', authenticateToken, async (req, res) => {
  try {
    const until = LeagueService.parseTimeoutDuration(req.body);
    const member = await LeagueService.muteMember(
      req.params.leagueId,
      req.userId,
      req.params.userId,
      until
    );
    res.json(member);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/:leagueId/members/:userId/unmute', authenticateToken, async (req, res) => {
  try {
    const member = await LeagueService.clearMute(
      req.params.leagueId,
      req.userId,
      req.params.userId
    );
    res.json(member);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/:leagueId/members/:userId/timeout', authenticateToken, async (req, res) => {
  try {
    const until = LeagueService.parseTimeoutDuration(req.body);
    const member = await LeagueService.timeoutMember(
      req.params.leagueId,
      req.userId,
      req.params.userId,
      until
    );
    res.json(member);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/:leagueId/members/:userId/clear-timeout', authenticateToken, async (req, res) => {
  try {
    const member = await LeagueService.clearTimeout(
      req.params.leagueId,
      req.userId,
      req.params.userId
    );
    res.json(member);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/:leagueId/members/:userId/kick', authenticateToken, async (req, res) => {
  try {
    const result = await LeagueService.kickMember(
      req.params.leagueId,
      req.userId,
      req.params.userId
    );
    io.to(`league_${req.params.leagueId}`).emit('league_membership_updated', {
      leagueId: req.params.leagueId,
      userId: req.params.userId,
      action: 'kicked'
    });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/:leagueId/tables/:gameId/remove-player', authenticateToken, async (req, res) => {
  try {
    await LeagueService.assertAdmin(req.params.leagueId, req.userId);
    const { userId: targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const game = await prisma.game.findFirst({
      where: { id: req.params.gameId, leagueId: req.params.leagueId }
    });
    if (!game) {
      return res.status(404).json({ error: 'Game not found in this league' });
    }

    if (['BIDDING', 'PLAYING'].includes(game.status)) {
      await GameService.replaceSeatedHumanWithBotInPlace(game.id, targetUserId);
    } else {
      await GameService.leaveGame(game.id, targetUserId).catch(async () => {
        await prisma.gamePlayer.deleteMany({
          where: { gameId: game.id, userId: targetUserId }
        });
      });
    }

    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/:leagueId/wallet', authenticateToken, async (req, res) => {
  try {
    const wallet = await LeagueWalletService.getWallet(req.params.leagueId, req.userId);
    res.json(wallet);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/:leagueId/wallet/ledger', authenticateToken, async (req, res) => {
  try {
    const ledger = await LeagueWalletService.getLedger(req.params.leagueId, req.userId, {
      limit: req.query.limit
    });
    res.json(ledger);
  } catch (error) {
    handleError(res, error);
  }
});

router.post('/:leagueId/wallet/credit', authenticateToken, async (req, res) => {
  try {
    const result = await LeagueWalletService.creditWinner(req.params.leagueId, req.userId, {
      userId: req.body.userId,
      amount: req.body.amount,
      note: req.body.note
    });
    if (io) {
      io.to(`league_${req.params.leagueId}`).emit('league_wallet_updated', {
        leagueId: req.params.leagueId,
        coinBalance: result.coinBalance
      });
    }
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
});

router.get('/:leagueId/chat', authenticateToken, async (req, res) => {
  try {
    const messages = await LeagueService.getRecentChat(req.params.leagueId, req.userId);
    res.json(messages);
  } catch (error) {
    handleError(res, error);
  }
});

router.delete('/:leagueId/chat/:messageId', authenticateToken, async (req, res) => {
  try {
    const result = await LeagueService.deleteChatMessage(
      req.params.leagueId,
      req.userId,
      req.params.messageId
    );
    if (io) {
      const admin = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { username: true }
      });
      const name = String(admin?.username || 'Admin').trim().split(/\s+/)[0] || 'Admin';
      io.to(`league_${req.params.leagueId}`).emit('league_chat_deleted', {
        ...result,
        deletedBy: name
      });
      LeagueChatHandler.emitSystemMessage(
        io,
        req.params.leagueId,
        `${name} deleted a message`
      );
    }
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
});

router.patch('/:leagueId/theme', authenticateToken, logoUpload.single('logo'), async (req, res) => {
  try {
    let logoUrl;
    if (req.file) {
      const relativePath = `/uploads/leagues/${req.file.filename}`;
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      logoUrl = host ? `${protocol}://${host}${relativePath}` : relativePath;
    } else if (req.body.logoUrl !== undefined) {
      logoUrl = req.body.logoUrl || null;
    }

    const league = await LeagueService.updateTheme(req.params.leagueId, req.userId, {
      name: req.body.name,
      bgColor: req.body.bgColor,
      logoUrl
    });
    res.json(league);
  } catch (error) {
    handleError(res, error);
  }
});

export default router;
