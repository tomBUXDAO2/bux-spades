/**
 * Idempotent: create League* tables on the connected DATABASE_URL.
 * Safe for Fly Postgres (does not drop columns / drift-diff).
 * Usage: node scripts/ensure-league-tables.js
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const statements = [
  `DO $$ BEGIN
    CREATE TYPE "LeagueMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN
    CREATE TYPE "LeagueJoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `CREATE TABLE IF NOT EXISTS "League" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL UNIQUE,
    "ownerId" TEXT NOT NULL,
    "bgColor" TEXT NOT NULL DEFAULT '#0f172a',
    "logoUrl" TEXT,
    "requireJoinApproval" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "LeagueMember" (
    "id" TEXT PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "LeagueMemberRole" NOT NULL DEFAULT 'MEMBER',
    "mutedUntil" TIMESTAMP(3),
    "timeoutUntil" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "LeagueJoinRequest" (
    "id" TEXT PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "LeagueJoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "LeagueChatMessage" (
    "id" TEXT PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "LeagueCreateRequest" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "requireJoinApproval" BOOLEAN NOT NULL DEFAULT true,
    "requesterId" TEXT NOT NULL,
    "status" "LeagueJoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approvedLeagueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "leagueId" TEXT`,
  `ALTER TABLE "League" ADD COLUMN IF NOT EXISTS "requireJoinApproval" BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE "League" ADD COLUMN IF NOT EXISTS "coinBalance" INTEGER NOT NULL DEFAULT 100000000`,
  `ALTER TABLE "League" ALTER COLUMN "coinBalance" SET DEFAULT 100000000`,
  `UPDATE "League" SET "coinBalance" = 100000000 WHERE "coinBalance" < 100000000`,
  `ALTER TABLE "League" ADD COLUMN IF NOT EXISTS "lastMonthlyCreditYm" TEXT`,
  `DO $$ BEGIN
    CREATE TYPE "LeagueWalletLedgerType" AS ENUM ('MONTHLY_ALLOWANCE', 'CREDIT_WINNER', 'ADJUSTMENT');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `CREATE TABLE IF NOT EXISTS "LeagueWalletLedger" (
    "id" TEXT PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "type" "LeagueWalletLedgerType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "note" TEXT,
    "actorUserId" TEXT,
    "creditedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS "LeagueWalletLedger_leagueId_createdAt_idx" ON "LeagueWalletLedger"("leagueId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "LeagueWalletLedger_creditedUserId_idx" ON "LeagueWalletLedger"("creditedUserId")`,
  `UPDATE "League" SET "lastMonthlyCreditYm" = to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), 'YYYY-MM') WHERE "lastMonthlyCreditYm" IS NULL`,
  `CREATE TABLE IF NOT EXISTS "LeagueAnnouncement" (
    "id" TEXT PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "LeagueAnnouncementReaction" (
    "id" TEXT PRIMARY KEY,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "LeagueAnnouncementRead" (
    "id" TEXT PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS "LeagueAnnouncement_leagueId_createdAt_idx" ON "LeagueAnnouncement"("leagueId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "LeagueAnnouncement_authorId_idx" ON "LeagueAnnouncement"("authorId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LeagueAnnouncementReaction_announcementId_userId_emoji_key" ON "LeagueAnnouncementReaction"("announcementId", "userId", "emoji")`,
  `CREATE INDEX IF NOT EXISTS "LeagueAnnouncementReaction_announcementId_idx" ON "LeagueAnnouncementReaction"("announcementId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LeagueAnnouncementRead_leagueId_userId_key" ON "LeagueAnnouncementRead"("leagueId", "userId")`,
  `ALTER TABLE "LeagueCreateRequest" ADD COLUMN IF NOT EXISTS "bgColor" TEXT NOT NULL DEFAULT '#0f172a'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LeagueMember_leagueId_userId_key" ON "LeagueMember"("leagueId", "userId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LeagueJoinRequest_leagueId_userId_key" ON "LeagueJoinRequest"("leagueId", "userId")`,
  `CREATE INDEX IF NOT EXISTS "Game_leagueId_idx" ON "Game"("leagueId")`,
  `CREATE INDEX IF NOT EXISTS "LeagueCreateRequest_status_createdAt_idx" ON "LeagueCreateRequest"("status", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "LeagueCreateRequest_requesterId_idx" ON "LeagueCreateRequest"("requesterId")`
];

async function main() {
  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (e) {
      console.error('Statement failed:', e.message);
      throw e;
    }
  }
  const rows = await prisma.$queryRawUnsafe(
    `SELECT to_regclass('public."League"')::text AS league,
            to_regclass('public."LeagueCreateRequest"')::text AS create_req`
  );
  console.log('OK', rows[0]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
