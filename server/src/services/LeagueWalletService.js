import { prisma } from '../config/databaseFirst.js';
import { LeagueService } from './LeagueService.js';

export const LEAGUE_MONTHLY_ALLOWANCE = 100;

export function currentCreditYm(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export class LeagueWalletService {
  static async getWallet(leagueId, viewerId) {
    await LeagueService.assertMember(leagueId, viewerId);
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, coinBalance: true, lastMonthlyCreditYm: true, name: true }
    });
    if (!league) {
      const err = new Error('League not found');
      err.status = 404;
      throw err;
    }
    return {
      leagueId: league.id,
      coinBalance: league.coinBalance,
      lastMonthlyCreditYm: league.lastMonthlyCreditYm,
      monthlyAllowance: LEAGUE_MONTHLY_ALLOWANCE
    };
  }

  static async getLedger(leagueId, viewerId, { limit = 50 } = {}) {
    await LeagueService.assertAdmin(leagueId, viewerId);
    const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const rows = await prisma.leagueWalletLedger.findMany({
      where: { leagueId },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        actor: { select: { id: true, username: true, avatarUrl: true } },
        creditedUser: { select: { id: true, username: true, avatarUrl: true } }
      }
    });
    return rows;
  }

  /**
   * Admin credits a member from the league wallet (manual prize payout).
   */
  static async creditWinner(leagueId, actorId, { userId, amount, note }) {
    await LeagueService.assertAdmin(leagueId, actorId);
    const targetMember = await LeagueService.getMembership(leagueId, userId);
    if (!targetMember) {
      const err = new Error('Recipient must be a league member');
      err.status = 400;
      throw err;
    }

    const coins = Math.floor(Number(amount));
    if (!Number.isFinite(coins) || coins <= 0) {
      const err = new Error('Amount must be a positive integer');
      err.status = 400;
      throw err;
    }
    if (coins > 1_000_000) {
      const err = new Error('Amount too large');
      err.status = 400;
      throw err;
    }

    const trimmedNote = note != null ? String(note).trim().slice(0, 280) : null;

    try {
      const result = await prisma.$transaction(async (tx) => {
        const league = await tx.league.findUnique({
          where: { id: leagueId },
          select: { id: true, coinBalance: true }
        });
        if (!league) {
          const err = new Error('League not found');
          err.status = 404;
          throw err;
        }
        if (league.coinBalance < coins) {
          const err = new Error(`Insufficient league balance (${league.coinBalance} available)`);
          err.status = 400;
          throw err;
        }

        const updatedLeague = await tx.league.update({
          where: { id: leagueId },
          data: { coinBalance: { decrement: coins } },
          select: { coinBalance: true }
        });

        await tx.user.update({
          where: { id: userId },
          data: { coins: { increment: coins } }
        });

        const entry = await tx.leagueWalletLedger.create({
          data: {
            leagueId,
            type: 'CREDIT_WINNER',
            amount: -coins,
            balanceAfter: updatedLeague.coinBalance,
            note: trimmedNote || null,
            actorUserId: actorId,
            creditedUserId: userId
          },
          include: {
            actor: { select: { id: true, username: true } },
            creditedUser: { select: { id: true, username: true } }
          }
        });

        return { coinBalance: updatedLeague.coinBalance, entry };
      });

      return result;
    } catch (error) {
      if (error.status) throw error;
      throw error;
    }
  }

  /** Seed opening balance when a league is created (same month marked credited). */
  static async seedOpeningBalance(tx, leagueId, amount = LEAGUE_MONTHLY_ALLOWANCE) {
    const ym = currentCreditYm();
    await tx.league.update({
      where: { id: leagueId },
      data: {
        coinBalance: amount,
        lastMonthlyCreditYm: ym
      }
    });
    await tx.leagueWalletLedger.create({
      data: {
        leagueId,
        type: 'MONTHLY_ALLOWANCE',
        amount,
        balanceAfter: amount,
        note: `Opening allowance ${ym}`
      }
    });
  }

  /** Idempotent monthly +100 for all leagues that have not been credited this UTC month. */
  static async runMonthlyAllowances(now = new Date()) {
    const ym = currentCreditYm(now);
    const due = await prisma.league.findMany({
      where: {
        OR: [{ lastMonthlyCreditYm: null }, { lastMonthlyCreditYm: { not: ym } }]
      },
      select: { id: true, coinBalance: true, lastMonthlyCreditYm: true }
    });

    let credited = 0;
    for (const league of due) {
      try {
        await prisma.$transaction(async (tx) => {
          const fresh = await tx.league.findUnique({
            where: { id: league.id },
            select: { id: true, coinBalance: true, lastMonthlyCreditYm: true }
          });
          if (!fresh || fresh.lastMonthlyCreditYm === ym) return;

          const updated = await tx.league.update({
            where: { id: league.id },
            data: {
              coinBalance: { increment: LEAGUE_MONTHLY_ALLOWANCE },
              lastMonthlyCreditYm: ym
            },
            select: { coinBalance: true }
          });

          await tx.leagueWalletLedger.create({
            data: {
              leagueId: league.id,
              type: 'MONTHLY_ALLOWANCE',
              amount: LEAGUE_MONTHLY_ALLOWANCE,
              balanceAfter: updated.coinBalance,
              note: `Monthly allowance ${ym}`
            }
          });
        });
        credited += 1;
      } catch (error) {
        console.error(`[LEAGUE WALLET] Monthly credit failed for ${league.id}:`, error);
      }
    }

    if (credited > 0) {
      console.log(`[LEAGUE WALLET] Credited monthly allowance to ${credited} league(s) for ${ym}`);
    }
    return { ym, credited, checked: due.length };
  }
}
