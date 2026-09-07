import { prisma } from '../config/database.js';
import { TournamentReadyService } from './TournamentReadyService.js';
import { DiscordTournamentService } from './DiscordTournamentService.js';

/**
 * Service to periodically check for expired tournament match timers
 */
export class TournamentTimerService {
  static intervalId = null;
  static client = null;
  static CHECK_INTERVAL_MS = 60 * 1000; // Check every minute

  /**
   * Start the timer checker
   */
  static start(client) {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.client = client;

    // Run immediately, then every minute
    this.checkExpiredTimers().catch(error => {
      console.error('[TOURNAMENT TIMER] Error in initial check:', error);
    });

    this.intervalId = setInterval(async () => {
      try {
        await this.checkExpiredTimers();
      } catch (error) {
        console.error('[TOURNAMENT TIMER] Error checking expired timers:', error);
      }
    }, this.CHECK_INTERVAL_MS);

    console.log('[TOURNAMENT TIMER] Started timer checker');
  }

  /**
   * Stop the timer checker
   */
  static stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.client = null;
    console.log('[TOURNAMENT TIMER] Stopped timer checker');
  }

  /**
   * Check all active tournament matches for expired timers
   */
  static async checkExpiredTimers() {
    if (!this.client) {
      console.log('[TOURNAMENT TIMER] No client available, skipping check');
      return;
    }

    try {
      console.log('[TOURNAMENT TIMER] Checking for expired timers...');
      // Find all matches that are waiting for players to ready up
      const activeMatches = await prisma.tournamentMatch.findMany({
        where: {
          status: 'PENDING',
        },
        include: {
          tournament: {
            include: {
              registrations: {
                include: {
                  user: true,
                  partner: true,
                },
              },
            },
          },
        },
      });

      console.log(`[TOURNAMENT TIMER] Found ${activeMatches.length} pending matches`);
      
      for (const match of activeMatches) {
        // League tournaments manage their own tables — never void via Discord timer path
        if (match.tournament?.leagueId) {
          continue;
        }

        console.log(`[TOURNAMENT TIMER] Checking match ${match.id}...`);
        // Check if this match has a timer set or if it expired (timer key might be deleted by Redis TTL)
        const readyStatus = await TournamentReadyService.getReadyStatus(match.id);
        console.log(`[TOURNAMENT TIMER] Match ${match.id} ready status:`, {
          timerExpiry: readyStatus.timerExpiry,
          ready: readyStatus.ready,
        });
        
        // Check if timer has expired (this will return true if timer key was deleted by Redis TTL)
        const isExpired = await TournamentReadyService.isTimerExpired(match.id);
        console.log(`[TOURNAMENT TIMER] Match ${match.id} timer expired?`, isExpired);
        
        // Never set → skip. Only process genuinely expired armed timers.
        if (!isExpired) {
          console.log(`[TOURNAMENT TIMER] Match ${match.id} timer not expired / never armed, skipping`);
          continue;
        }
        
        console.log(`[TOURNAMENT TIMER] Match ${match.id} timer has expired!`);

        // Build team ID to player IDs map
        const teamIdToPlayerIds = new Map();
        for (const reg of match.tournament.registrations) {
          if (reg.partnerId && reg.isComplete) {
            const teamId = `team_${reg.userId}_${reg.partnerId}`;
            if (!teamIdToPlayerIds.has(teamId)) {
              teamIdToPlayerIds.set(teamId, [reg.userId, reg.partnerId]);
            }
          } else if (!reg.partnerId && !reg.isSub) {
            const teamId = `team_${reg.userId}`;
            teamIdToPlayerIds.set(teamId, [reg.userId]);
          }
        }

        const team1Players = teamIdToPlayerIds.get(match.team1Id) || [];
        const team2Players = match.team2Id ? (teamIdToPlayerIds.get(match.team2Id) || []) : null;
        const allPlayerIds = [...team1Players, ...(team2Players || [])];

        // Check timer expiry and get missing players
        const expiryCheck = await TournamentReadyService.handleTimerExpiry(match.id, allPlayerIds);

        if (expiryCheck.expired) {
          console.log(`[TOURNAMENT TIMER] Timer expired for match ${match.id}, handling expiry...`);
          await DiscordTournamentService.handleTimerExpiry(
            this.client,
            match,
            match.tournament,
            expiryCheck
          );
        }
      }
    } catch (error) {
      console.error('[TOURNAMENT TIMER] Error checking expired timers:', error);
    }
  }
}
