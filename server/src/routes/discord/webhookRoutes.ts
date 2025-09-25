import { Router } from 'express';

// Import Discord bot functions (optional)
let checkAndUpdateUserRole: any = null;
let verifyFacebookConnection: any = null;
let revokeFacebookVerification: any = null;
let sendLeagueGameResults: any = null;

try {
  const botModule = require('../../discord-bot/bot');
  checkAndUpdateUserRole = botModule.checkAndUpdateUserRole;
  verifyFacebookConnection = botModule.verifyFacebookConnection;
  revokeFacebookVerification = botModule.revokeFacebookVerification;
  sendLeagueGameResults = botModule.sendLeagueGameResults;
} catch (error) {
  console.warn('Discord bot functions not available:', error);
}

const router = Router();

// Webhook endpoint to manually check a user's Facebook connection
router.post('/webhook/check-facebook', async (req, res) => {
  try {
    const { discordId } = req.body;
    
    if (!discordId) {
      return res.status(400).json({ error: 'Discord ID is required' });
    }
    
    if (!checkAndUpdateUserRole) {
      return res.status(503).json({ error: 'Discord bot not available' });
    }
    
    console.log(`Manual Facebook check requested for Discord user: ${discordId}`);
    await checkAndUpdateUserRole(discordId);
    
    res.json({ success: true, message: 'Facebook connection check completed' });
  } catch (error) {
    console.error('Error in Facebook check webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Webhook endpoint to verify a user's Facebook connection
router.post('/webhook/verify-facebook', async (req, res) => {
  try {
    const { discordId } = req.body;
    
    if (!discordId) {
      return res.status(400).json({ error: 'Discord ID is required' });
    }
    
    if (!verifyFacebookConnection) {
      return res.status(503).json({ error: 'Discord bot not available' });
    }
    
    console.log(`Facebook verification requested for Discord user: ${discordId}`);
    await verifyFacebookConnection(discordId);
    
    res.json({ success: true, message: 'Facebook connection verified and LEAGUE role awarded' });
  } catch (error) {
    console.error('Error in Facebook verification webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Webhook endpoint to revoke a user's Facebook verification
router.post('/webhook/revoke-facebook', async (req, res) => {
  try {
    const { discordId } = req.body;
    
    if (!discordId) {
      return res.status(400).json({ error: 'Discord ID is required' });
    }
    
    if (!revokeFacebookVerification) {
      return res.status(503).json({ error: 'Discord bot not available' });
    }
    
    console.log(`Facebook verification revocation requested for Discord user: ${discordId}`);
    await revokeFacebookVerification(discordId);
    
    res.json({ success: true, message: 'Facebook verification revoked and LEAGUE role removed' });
  } catch (error) {
    console.error('Error in Facebook revocation webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Webhook endpoint to trigger Discord embed for a game
router.post('/webhook/trigger-game-embed', async (req, res) => {
  try {
    const { gameId } = req.body;
    
    if (!gameId) {
      return res.status(400).json({ error: 'Game ID is required' });
    }
    
    if (!sendLeagueGameResults) {
      return res.status(503).json({ error: 'Discord bot not available' });
    }
    
    // Import Prisma to get game data
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    try {
      // Get the game and its players
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          GamePlayer: {
            orderBy: { seatIndex: 'asc' }
          },
          GameResult: true
        }
      });
      
      if (!game) {
        return res.status(404).json({ error: 'Game not found' });
      }
      
      if (!game.GameResult) {
        return res.status(400).json({ error: 'Game has no result data' });
      }
      
      // Create game data object in the format expected by sendLeagueGameResults
      const gameData = {
        id: game.id,
        mode: game.mode,
        bidType: game.bidType,
        buyIn: game.buyIn,
        players: game.GamePlayer.map((p: any) => ({
          userId: p.discordId || p.userId,
          username: p.username,
          seatIndex: p.seatIndex,
          team: p.team,
          bid: p.bid,
          bags: p.bags,
          points: p.points,
          won: p.won
        })),
        team1Score: game.GameResult.team1Score,
        team2Score: game.GameResult.team2Score,
        winner: game.GameResult.winner
      };
      
      // Create game line string
      const gameLine = `${game.buyIn >= 1000000 ? `${game.buyIn / 1000000}M` : `${game.buyIn / 1000}k`} ${game.mode} ${game.maxPoints}/${game.minPoints} ${game.bidType}`;
      
      console.log(`Triggering Discord embed for game: ${gameId}`);
      await sendLeagueGameResults(gameData, gameLine);
      
      res.json({ success: true, message: 'Discord embed triggered successfully' });
      
    } finally {
      await prisma.$disconnect();
    }
    
  } catch (error) {
    console.error('Error in trigger game embed webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
