-- Performance optimization indexes for game queries
-- These indexes will dramatically improve query performance for game state retrieval

-- Critical indexes for trick queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_trick_roundid_tricknumber" ON "Trick"("roundId", "trickNumber");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_trick_roundid_winningseat" ON "Trick"("roundId", "winningSeatIndex");

-- Critical indexes for trick card queries  
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_trickcard_trickid_playorder" ON "TrickCard"("trickId", "playOrder");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_trickcard_roundid_seatindex" ON "TrickCard"("roundId", "seatIndex");

-- Critical indexes for player stats queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_playerroundstats_roundid_seatindex" ON "PlayerRoundStats"("roundId", "seatIndex");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_playerroundstats_roundid_trickswon" ON "PlayerRoundStats"("roundId", "tricksWon");

-- Critical indexes for bidding queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_roundbid_roundid_seatindex" ON "RoundBid"("roundId", "seatIndex");

-- Critical indexes for game player queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_gameplayer_gameid_seatindex" ON "GamePlayer"("gameId", "seatIndex");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_gameplayer_userid" ON "GamePlayer"("userId");

-- Critical indexes for round queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_round_gameid_roundnumber" ON "Round"("gameId", "roundNumber");

-- Critical indexes for game queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_game_status" ON "Game"("status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_game_createdat" ON "Game"("createdAt");

-- Composite indexes for common query patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_trick_completion_lookup" ON "Trick"("roundId", "trickNumber", "winningSeatIndex");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_trickcard_playorder_lookup" ON "TrickCard"("trickId", "playOrder", "seatIndex");
