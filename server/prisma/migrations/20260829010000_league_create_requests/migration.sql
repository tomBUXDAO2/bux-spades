-- Add join-approval flag + league create requests
ALTER TABLE "League" ADD COLUMN IF NOT EXISTS "requireJoinApproval" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "LeagueCreateRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "requireJoinApproval" BOOLEAN NOT NULL DEFAULT true,
    "requesterId" TEXT NOT NULL,
    "status" "LeagueJoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approvedLeagueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeagueCreateRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeagueCreateRequest_status_createdAt_idx" ON "LeagueCreateRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "LeagueCreateRequest_requesterId_idx" ON "LeagueCreateRequest"("requesterId");

DO $$ BEGIN
  ALTER TABLE "LeagueCreateRequest" ADD CONSTRAINT "LeagueCreateRequest_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LeagueCreateRequest" ADD CONSTRAINT "LeagueCreateRequest_approvedLeagueId_fkey"
    FOREIGN KEY ("approvedLeagueId") REFERENCES "League"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
