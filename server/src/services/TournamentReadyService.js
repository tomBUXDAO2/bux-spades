import { redisClient } from '../config/redis.js';
import { prisma } from '../config/database.js';
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';

export class TournamentReadyService {
  static READY_TTL = 300; // 5 minutes in seconds

  /**
   * Get ready status key for a match
   */
  static getReadyStatusKey(matchId) {
    return `tournament:ready:${matchId}`;
  }

  /**
   * Get timer expiry key for a match
   */
  static getTimerKey(matchId) {
    return `tournament:timer:${matchId}`;
  }

  /**
   * Mark a player as ready for a match
   */
  static async markPlayerReady(matchId, userId, discordId) {
    try {
      if (!redisClient) {
        console.error('[TOURNAMENT READY] Redis client not available');
        return false;
      }
      
      // Check if Redis is connected
      try {
        await redisClient.ping();
      } catch (pingError) {
        console.error('[TOURNAMENT READY] Redis ping failed, attempting to connect...', pingError);
        try {
          if (!redisClient.isOpen) {
            await redisClient.connect();
          }
        } catch (connectError) {
          console.error('[TOURNAMENT READY] Failed to connect to Redis:', connectError);
          return false;
        }
      }
      
      console.log('[TOURNAMENT READY] Marking ready - matchId:', matchId, 'userId:', userId, 'discordId:', discordId);
      
      const key = this.getReadyStatusKey(matchId);
      console.log('[TOURNAMENT READY] Getting ready data from key:', key);
      const readyData = await redisClient.get(key);
      console.log('[TOURNAMENT READY] Ready data from Redis:', readyData);
      
      // Initialize ready object - always use arrays, not Sets
      let ready;
      if (readyData) {
        ready = JSON.parse(readyData);
        // Ensure ready is an array (might be stored as array or Set-like object)
        if (!Array.isArray(ready.ready)) {
          ready.ready = ready.ready ? Array.from(ready.ready) : [];
        }
      } else {
        ready = { ready: [], players: {} };
      }
      
      // Ensure players object exists
      if (!ready.players) ready.players = {};
      
      // Add userId to ready array if not already present
      if (!ready.ready.includes(userId)) {
        ready.ready.push(userId);
      }
      ready.players[userId] = {
        discordId,
        readyAt: new Date().toISOString(),
      };
      
      // Save back (Set stored as array)
      await redisClient.setEx(key, this.READY_TTL, JSON.stringify({
        ...ready,
        ready: [...new Set(ready.ready)], // Ensure uniqueness
      }));
      
      return true;
    } catch (error) {
      console.error('[TOURNAMENT READY] Error marking player ready:', error);
      return false;
    }
  }

  /**
   * Get ready status for a match
   */
  static async getReadyStatus(matchId) {
    try {
      if (!redisClient) {
        console.log(`[TOURNAMENT READY] Redis client not available for match ${matchId}`);
        return { ready: [], players: {}, timerExpiry: null };
      }
      
      const key = this.getReadyStatusKey(matchId);
      const timerKey = this.getTimerKey(matchId);
      
      const readyData = await redisClient.get(key);
      const timerExpiry = await redisClient.get(timerKey);
      
      console.log(`[TOURNAMENT READY] Getting ready status for match ${matchId}: timerKey=${timerKey}, timerExpiry=${timerExpiry}`);
      
      const ready = readyData ? JSON.parse(readyData) : { ready: [], players: {} };
      
      return {
        ready: ready.ready || [],
        players: ready.players || {},
        timerExpiry: timerExpiry ? parseInt(timerExpiry) : null,
      };
    } catch (error) {
      console.error('[TOURNAMENT READY] Error getting ready status:', error);
      return { ready: [], players: {}, timerExpiry: null };
    }
  }

  /**
   * Set timer expiry for a match
   */
  static async setTimer(matchId, expiryTimestamp) {
    try {
      if (!redisClient) {
        console.error('[TOURNAMENT READY] Redis client not available for setting timer');
        return false;
      }
      
      const key = this.getTimerKey(matchId);
      const ttl = Math.max(0, Math.floor((expiryTimestamp - Date.now()) / 1000));
      
      console.log(`[TOURNAMENT READY] Setting timer for match ${matchId}: expiry=${expiryTimestamp}, ttl=${ttl}s, key=${key}`);
      
      if (ttl > 0) {
        await redisClient.setEx(key, ttl, expiryTimestamp.toString());
        console.log(`[TOURNAMENT READY] Timer set successfully for match ${matchId}`);
      } else {
        console.warn(`[TOURNAMENT READY] Timer TTL is ${ttl}, not setting timer for match ${matchId}`);
      }
      
      return true;
    } catch (error) {
      console.error('[TOURNAMENT READY] Error setting timer:', error);
      return false;
    }
  }

  /**
   * Check if all players are ready
   */
  static async areAllPlayersReady(matchId, expectedPlayerIds) {
    const status = await this.getReadyStatus(matchId);
    const readySet = new Set(status.ready || []);
    
    return expectedPlayerIds.every(id => readySet.has(id));
  }

  /**
   * Get time remaining in seconds
   * Returns 0 if timer doesn't exist (either never set or expired and deleted by Redis TTL)
   */
  static async getTimeRemaining(matchId) {
    try {
      if (!redisClient) return 0;
      
      const timerKey = this.getTimerKey(matchId);
      const expiry = await redisClient.get(timerKey);
      
      if (!expiry) {
        console.log(`[TOURNAMENT READY] Timer key ${timerKey} not found (expired or never set)`);
        return 0; // Timer expired (Redis TTL deleted it) or never set
      }
      
      const expiryTimestamp = parseInt(expiry);
      const remaining = Math.max(0, Math.floor((expiryTimestamp - Date.now()) / 1000));
      
      console.log(`[TOURNAMENT READY] Time remaining for match ${matchId}: ${remaining}s (expires at ${expiryTimestamp}, now ${Date.now()})`);
      return remaining;
    } catch (error) {
      console.error('[TOURNAMENT READY] Error getting time remaining:', error);
      return 0;
    }
  }

  /**
   * Clear ready status for a match
   */
  static async clearReadyStatus(matchId) {
    try {
      if (!redisClient) return false;
      
      const key = this.getReadyStatusKey(matchId);
      const timerKey = this.getTimerKey(matchId);
      
      await redisClient.del(key);
      await redisClient.del(timerKey);
      
      return true;
    } catch (error) {
      console.error('[TOURNAMENT READY] Error clearing ready status:', error);
      return false;
    }
  }

  /**
   * Check if timer has expired for a match
   */
  static async isTimerExpired(matchId) {
    try {
      const timeRemaining = await this.getTimeRemaining(matchId);
      return timeRemaining <= 0;
    } catch (error) {
      console.error('[TOURNAMENT READY] Error checking timer expiry:', error);
      return false;
    }
  }

  /**
   * Handle timer expiry for a match
   * Returns: { expired: boolean, missingCount: number, missingPlayerIds: string[] }
   */
  static async handleTimerExpiry(matchId, expectedPlayerIds) {
    try {
      const isExpired = await this.isTimerExpired(matchId);
      if (!isExpired) {
        return { expired: false, missingCount: 0, missingPlayerIds: [] };
      }

      const readyStatus = await this.getReadyStatus(matchId);
      const readySet = new Set(readyStatus.ready || []);
      const missingPlayerIds = expectedPlayerIds.filter(id => !readySet.has(id));
      const missingCount = missingPlayerIds.length;

      return {
        expired: true,
        missingCount,
        missingPlayerIds,
        readyPlayerIds: expectedPlayerIds.filter(id => readySet.has(id)),
      };
    } catch (error) {
      console.error('[TOURNAMENT READY] Error handling timer expiry:', error);
      return { expired: false, missingCount: 0, missingPlayerIds: [] };
    }
  }

  /**
   * Format time remaining as MM:SS
   */
  static formatTimeRemaining(seconds) {
    if (seconds <= 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Build ready button embed with current status
   */
  static buildReadyEmbed(match, tournament, teamIdToPlayers, readyStatus, timeRemaining) {
    const team1Players = teamIdToPlayers.get(match.team1Id) || [];
    const team2Players = match.team2Id ? (teamIdToPlayers.get(match.team2Id) || []) : null;
    
    const allPlayerIds = [
      ...team1Players.map(p => p.id),
      ...(team2Players || []).map(p => p.id),
    ];
    
    const readySet = new Set(readyStatus.ready || []);
    const allReady = allPlayerIds.length === 4 && allPlayerIds.every(id => readySet.has(id));
    
    const readyPlayers = [];
    const waitingPlayers = [];
    
    [...team1Players, ...(team2Players || [])].forEach(player => {
      if (readySet.has(player.id)) {
        readyPlayers.push(`✅ <@${player.discordId}>`);
      } else {
        waitingPlayers.push(`⏳ <@${player.discordId}>`);
      }
    });
    
    const embed = new EmbedBuilder()
      .setTitle(`🎮 Match ${match.matchNumber} - ${allReady ? 'READY!' : 'Waiting for Players'}`)
      .setDescription(
        `**Team 1:** ${team1Players.map(p => `<@${p.discordId}>`).join(' & ')}\n` +
        (team2Players ? `**Team 2:** ${team2Players.map(p => `<@${p.discordId}>`).join(' & ')}\n` : '') +
        `\n**Ready (${readyPlayers.length}/4):**\n${readyPlayers.join('\n') || 'None'}\n` +
        `\n**Waiting:**\n${waitingPlayers.join('\n') || 'None'}\n` +
        `\n**Time Remaining:** ${this.formatTimeRemaining(timeRemaining)}`
      )
      .setColor(allReady ? 0x00ff00 : 0xffaa00)
      .setTimestamp();
    
    return embed;
  }

  /**
   * Build ready button (one button for all players)
   */
  static buildReadyButton(matchId) {
    return new ButtonBuilder()
      .setCustomId(`tournament_ready_${matchId}`)
      .setLabel('Ready ✓')
      .setStyle(ButtonStyle.Success);
  }
}
