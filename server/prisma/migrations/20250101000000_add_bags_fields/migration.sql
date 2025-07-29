-- Add totalBags and bagsPerGame columns to UserStats table
ALTER TABLE "UserStats" ADD COLUMN "totalBags" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UserStats" ADD COLUMN "bagsPerGame" DOUBLE PRECISION NOT NULL DEFAULT 0; 