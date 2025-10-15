import { redisClient } from '../config/redis.js';

/**
 * Service for managing user sessions with single device login enforcement
 */
class RedisSessionService {
  constructor() {
    this.SESSION_PREFIX = 'user_session:';
    this.SESSION_TTL = 60 * 60 * 24 * 7; // 7 days in seconds
  }

  /**
   * Get the Redis key for a user's session
   */
  getSessionKey(userId) {
    return `${this.SESSION_PREFIX}${userId}`;
  }

  /**
   * Store user session with socket ID and active game info
   * Returns the previous session data if it exists
   */
  async setUserSession(userId, sessionData) {
    try {
      if (!redisClient) return null;
      
      const key = this.getSessionKey(userId);
      
      // Get previous session before overwriting
      const previousSession = await this.getUserSession(userId);
      
      // Store new session
      const data = {
        socketId: sessionData.socketId,
        activeGameId: sessionData.activeGameId || null,
        loginTime: new Date().toISOString(),
        ...sessionData
      };
      
      await redisClient.setEx(key, this.SESSION_TTL, JSON.stringify(data));
      console.log(`[SESSION] Stored session for user ${userId}, socket ${sessionData.socketId}`);
      
      return previousSession;
    } catch (error) {
      console.error('[SESSION] Error setting user session:', error);
      return null;
    }
  }

  /**
   * Get user session data
   */
  async getUserSession(userId) {
    try {
      if (!redisClient) return null;
      
      const key = this.getSessionKey(userId);
      const data = await redisClient.get(key);
      
      if (!data) return null;
      
      return JSON.parse(data);
    } catch (error) {
      console.error('[SESSION] Error getting user session:', error);
      return null;
    }
  }

  /**
   * Remove user session
   */
  async removeUserSession(userId) {
    try {
      if (!redisClient) return false;
      
      const key = this.getSessionKey(userId);
      await redisClient.del(key);
      console.log(`[SESSION] Removed session for user ${userId}`);
      return true;
    } catch (error) {
      console.error('[SESSION] Error removing user session:', error);
      return false;
    }
  }

  /**
   * Update active game ID for a user session
   */
  async updateActiveGame(userId, gameId) {
    try {
      if (!redisClient) return false;
      
      const session = await this.getUserSession(userId);
      if (!session) return false;
      
      session.activeGameId = gameId;
      await redisClient.setEx(this.getSessionKey(userId), this.SESSION_TTL, JSON.stringify(session));
      console.log(`[SESSION] Updated active game for user ${userId} to ${gameId}`);
      return true;
    } catch (error) {
      console.error('[SESSION] Error updating active game:', error);
      return false;
    }
  }

  /**
   * Clear active game ID for a user session
   */
  async clearActiveGame(userId) {
    try {
      if (!redisClient) return false;
      
      const session = await this.getUserSession(userId);
      if (!session) return false;
      
      session.activeGameId = null;
      await redisClient.setEx(this.getSessionKey(userId), this.SESSION_TTL, JSON.stringify(session));
      console.log(`[SESSION] Cleared active game for user ${userId}`);
      return true;
    } catch (error) {
      console.error('[SESSION] Error clearing active game:', error);
      return false;
    }
  }

  /**
   * Remove ALL user sessions (global logout)
   */
  async clearAllSessions() {
    try {
      if (!redisClient) return { deleted: 0 };

      // Prefer SCAN to avoid blocking Redis
      let cursor = '0';
      let totalDeleted = 0;
      do {
        const scanResult = await redisClient.scan(cursor, {
          MATCH: `${this.SESSION_PREFIX}*`,
          COUNT: 500
        });
        cursor = scanResult.cursor;
        const keys = scanResult.keys || [];
        if (keys.length > 0) {
          // Use UNLINK for asynchronous deletion if available, fallback to DEL
          if (typeof redisClient.unlink === 'function') {
            const deleted = await redisClient.unlink(keys);
            totalDeleted += Number(deleted) || 0;
          } else {
            const deleted = await redisClient.del(keys);
            totalDeleted += Number(deleted) || 0;
          }
        }
      } while (cursor !== '0');

      console.log(`[SESSION] Cleared all sessions. Deleted: ${totalDeleted}`);
      return { deleted: totalDeleted };
    } catch (error) {
      console.error('[SESSION] Error clearing all sessions:', error);
      return { deleted: 0, error: String(error?.message || error) };
    }
  }
}

// Export singleton instance
export default new RedisSessionService();

