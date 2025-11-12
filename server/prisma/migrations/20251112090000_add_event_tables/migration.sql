-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventCriterionType" AS ENUM (
  'MOST_WINS',
  'MOST_GAMES_PLAYED',
  'HIGHEST_WIN_PERCENT',
  'GAMES_PLAYED_MILESTONE',
  'GAMES_WON_MILESTONE'
);

-- AlterTable
ALTER TABLE "Game" ADD COLUMN "eventId" TEXT;

-- CreateTable
CREATE TABLE "Event" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "timezone" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "EventStatus" NOT NULL DEFAULT 'SCHEDULED',
  "bannerUrl" TEXT,
  "filters" JSONB,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventCriterion" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "type" "EventCriterionType" NOT NULL,
  "rewardCoins" INTEGER NOT NULL,
  "milestoneValue" INTEGER,
  "config" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventParticipantStat" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
  "gamesWon" INTEGER NOT NULL DEFAULT 0,
  "winPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "milestoneProgress" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventParticipantStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventGame" (
  "eventId" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "qualifies" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventGame_pkey" PRIMARY KEY ("eventId", "gameId")
);

-- CreateIndex
CREATE INDEX "Event_status_idx" ON "Event"("status");

-- CreateIndex
CREATE INDEX "Event_startsAt_idx" ON "Event"("startsAt");

-- CreateIndex
CREATE INDEX "Event_endsAt_idx" ON "Event"("endsAt");

-- CreateIndex
CREATE INDEX "EventCriterion_eventId_type_idx" ON "EventCriterion"("eventId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "EventParticipantStat_eventId_userId_key" ON "EventParticipantStat"("eventId", "userId");

-- CreateIndex
CREATE INDEX "EventParticipantStat_userId_idx" ON "EventParticipantStat"("userId");

-- CreateIndex
CREATE INDEX "EventGame_gameId_idx" ON "EventGame"("gameId");

-- AddForeignKey
ALTER TABLE "Game"
ADD CONSTRAINT "Game_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCriterion"
ADD CONSTRAINT "EventCriterion_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipantStat"
ADD CONSTRAINT "EventParticipantStat_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipantStat"
ADD CONSTRAINT "EventParticipantStat_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventGame"
ADD CONSTRAINT "EventGame_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventGame"
ADD CONSTRAINT "EventGame_gameId_fkey"
FOREIGN KEY ("gameId") REFERENCES "Game"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

