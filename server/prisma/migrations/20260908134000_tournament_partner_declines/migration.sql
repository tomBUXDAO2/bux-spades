-- CreateTable
CREATE TABLE "TournamentPartnerDecline" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentPartnerDecline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentPartnerDecline_tournamentId_idx" ON "TournamentPartnerDecline"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentPartnerDecline_tournamentId_fromUserId_toUserId_key" ON "TournamentPartnerDecline"("tournamentId", "fromUserId", "toUserId");

-- AddForeignKey
ALTER TABLE "TournamentPartnerDecline" ADD CONSTRAINT "TournamentPartnerDecline_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
