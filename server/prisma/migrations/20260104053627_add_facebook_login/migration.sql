-- AlterTable: Make discordId nullable
ALTER TABLE "User" ALTER COLUMN "discordId" DROP NOT NULL;

-- AlterTable: Add facebookId column
ALTER TABLE "User" ADD COLUMN "facebookId" TEXT;

-- CreateIndex: Add unique constraint on facebookId
CREATE UNIQUE INDEX "User_facebookId_key" ON "User"("facebookId");

