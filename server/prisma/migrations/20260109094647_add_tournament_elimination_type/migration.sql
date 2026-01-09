-- CreateEnum
CREATE TYPE "TournamentEliminationType" AS ENUM ('SINGLE', 'DOUBLE');

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "eliminationType" "TournamentEliminationType" NOT NULL DEFAULT 'SINGLE';
