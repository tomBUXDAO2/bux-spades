import { prisma } from '../config/database.js';

export class BotUserService {
  // Create a bot user in the database
  static async createBotUser(botId, gameId) {
    try {
      const botUsername = `Bot_${botId}`;
      
      // Check if bot already exists
      const existingBot = await prisma.user.findUnique({
        where: { discordId: botId }
      });
      
      if (existingBot) {
        console.log(`[BOT USER] Bot ${botUsername} already exists`);
        return existingBot;
      }
      
      // Create new bot user
      const botAvatars = [
        'https://api.dicebear.com/7.x/bottts/svg?seed=alice',
        'https://api.dicebear.com/7.x/bottts/svg?seed=bob',
        'https://api.dicebear.com/7.x/bottts/svg?seed=charlie',
        'https://api.dicebear.com/7.x/bottts/svg?seed=diana'
      ];
      
      // Extract seat index from botId (format: bot_0_timestamp)
      const seatIndex = parseInt(botId.split('_')[1]) || 0;
      const botAvatar = botAvatars[seatIndex % botAvatars.length];
      
      const botUser = await prisma.user.create({
        data: {
          discordId: botId,
          username: botUsername,
          avatarUrl: botAvatar,
          coins: 1000000, // Bots start with 1M coins
          soundEnabled: false
        }
      });
      
      console.log(`[BOT USER] Created bot user: ${botUsername} (${botUser.id})`);
      return botUser;
      
    } catch (error) {
      console.error('[BOT USER] Error creating bot user:', error);
      throw error;
    }
  }
  
  // Delete a bot user from the database
  static async deleteBotUser(botId) {
    try {
      const botUser = await prisma.user.findUnique({
        where: { discordId: botId }
      });
      
      if (!botUser) {
        console.log(`[BOT USER] Bot ${botId} not found`);
        return false;
      }
      
      // Check if bot is in any active games
      const activeGames = await prisma.gamePlayer.findMany({
        where: {
          userId: botUser.id,
          leftAt: null,
          game: {
            status: {
              in: ['WAITING', 'BIDDING', 'PLAYING']
            }
          }
        }
      });
      
      if (activeGames.length > 0) {
        console.log(`[BOT USER] Cannot delete bot ${botId} - still in ${activeGames.length} active games`);
        return false;
      }
      
      // Delete the bot user (cascade will handle related records)
      await prisma.user.delete({
        where: { discordId: botId }
      });
      
      console.log(`[BOT USER] Deleted bot user: ${botUser.username} (${botUser.id})`);
      return true;
      
    } catch (error) {
      console.error('[BOT USER] Error deleting bot user:', error);
      throw error;
    }
  }
  
  // Get bot user by bot ID
  static async getBotUser(botId) {
    try {
      return await prisma.user.findUnique({
        where: { discordId: botId }
      });
    } catch (error) {
      console.error('[BOT USER] Error getting bot user:', error);
      throw error;
    }
  }
  
  // Check if a user is a bot
  static isBotUser(user) {
    return user && user.discordId && user.discordId.startsWith('bot_');
  }
}
