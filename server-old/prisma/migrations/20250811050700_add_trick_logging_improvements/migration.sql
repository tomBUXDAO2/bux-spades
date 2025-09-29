-- Add missing fields to Game table
ALTER TABLE "Game" ADD COLUMN "solo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Game" ADD COLUMN "whiz" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Game" ADD COLUMN "mirror" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Game" ADD COLUMN "gimmick" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Game" ADD COLUMN "screamer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Game" ADD COLUMN "assassin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Game" ADD COLUMN "rated" BOOLEAN DEFAULT false;
ALTER TABLE "Game" ADD COLUMN "completed" BOOLEAN DEFAULT false;
ALTER TABLE "Game" ADD COLUMN "cancelled" BOOLEAN DEFAULT false;
ALTER TABLE "Game" ADD COLUMN "finalScore" INTEGER;
ALTER TABLE "Game" ADD COLUMN "winner" INTEGER;
ALTER TABLE "Game" ADD COLUMN "gameType" TEXT DEFAULT 'REGULAR';
ALTER TABLE "Game" ADD COLUMN "specialRulesApplied" "SpecialRule"[] DEFAULT '{}';
ALTER TABLE "Game" ADD COLUMN "league" BOOLEAN DEFAULT false;

-- Add missing fields to GamePlayer table
ALTER TABLE "GamePlayer" ADD COLUMN "finalScore" INTEGER;
ALTER TABLE "GamePlayer" ADD COLUMN "finalBags" INTEGER;
ALTER TABLE "GamePlayer" ADD COLUMN "finalPoints" INTEGER;
ALTER TABLE "GamePlayer" ADD COLUMN "won" BOOLEAN;

-- Add missing fields to UserStats table
ALTER TABLE "UserStats" ADD COLUMN "totalBags" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UserStats" ADD COLUMN "bagsPerGame" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "UserStats" ADD COLUMN "partnersGamesPlayed" INTEGER DEFAULT 0;
ALTER TABLE "UserStats" ADD COLUMN "partnersGamesWon" INTEGER DEFAULT 0;
ALTER TABLE "UserStats" ADD COLUMN "partnersTotalBags" INTEGER DEFAULT 0;
ALTER TABLE "UserStats" ADD COLUMN "partnersBagsPerGame" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "UserStats" ADD COLUMN "soloGamesPlayed" INTEGER DEFAULT 0;
ALTER TABLE "UserStats" ADD COLUMN "soloGamesWon" INTEGER DEFAULT 0;
ALTER TABLE "UserStats" ADD COLUMN "soloTotalBags" INTEGER DEFAULT 0;
ALTER TABLE "UserStats" ADD COLUMN "soloBagsPerGame" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "UserStats" ADD COLUMN "totalCoinsWon" INTEGER DEFAULT 0;
ALTER TABLE "UserStats" ADD COLUMN "totalCoinsLost" INTEGER DEFAULT 0;
ALTER TABLE "UserStats" ADD COLUMN "netCoins" INTEGER DEFAULT 0;

-- Create GameResult table
CREATE TABLE "GameResult" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "winner" INTEGER NOT NULL,
    "finalScore" INTEGER NOT NULL,
    "gameDuration" INTEGER,
    "team1Score" INTEGER,
    "team2Score" INTEGER,
    "playerResults" JSONB NOT NULL,
    "totalRounds" INTEGER NOT NULL,
    "totalTricks" INTEGER NOT NULL,
    "specialEvents" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameResult_pkey" PRIMARY KEY ("id")
);

-- Add unique constraint to GameResult
CREATE UNIQUE INDEX "GameResult_gameId_key" ON "GameResult"("gameId");

-- Add foreign key to GameResult
ALTER TABLE "GameResult" ADD CONSTRAINT "GameResult_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add trickNumber field to Trick table for better trick logging
ALTER TABLE "Trick" ADD COLUMN "trickNumber" INTEGER NOT NULL DEFAULT 1;

-- Add position field to Card table for better card tracking
ALTER TABLE "Card" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- Add unique constraint to Trick table for roundId + trickNumber
CREATE UNIQUE INDEX "Trick_roundId_trickNumber_key" ON "Trick"("roundId", "trickNumber");

-- Update User table to use cuid() for id generation
ALTER TABLE "User" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "User" ALTER COLUMN "password" SET DEFAULT '';

-- Update all other tables to use cuid() for id generation
ALTER TABLE "Game" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "GamePlayer" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "Round" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "Trick" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "Card" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "UserStats" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "GameResult" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "Friend" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "BlockedUser" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text; 