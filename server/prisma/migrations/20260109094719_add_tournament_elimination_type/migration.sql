-- CreateEnum (if not exists)
DO $$ BEGIN
    CREATE TYPE "TournamentEliminationType" AS ENUM ('SINGLE', 'DOUBLE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "eliminationType" "TournamentEliminationType" NOT NULL DEFAULT 'SINGLE';
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "specialRules" JSONB;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "tournamentBuyIn" INTEGER;
