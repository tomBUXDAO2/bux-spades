import { LeagueWalletService } from './LeagueWalletService.js';

const HOUR_MS = 60 * 60 * 1000;

let intervalId = null;

export function startLeagueWalletScheduler() {
  if (intervalId) return;

  const tick = async () => {
    try {
      await LeagueWalletService.runMonthlyAllowances();
    } catch (error) {
      console.error('[LEAGUE WALLET SCHEDULER] Tick error:', error);
    }
  };

  // Run soon after boot, then hourly (idempotent per YYYY-MM).
  setTimeout(tick, 15_000);
  intervalId = setInterval(tick, HOUR_MS);
  console.log('[LEAGUE WALLET SCHEDULER] Started (hourly monthly-allowance check)');
}

export function stopLeagueWalletScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
