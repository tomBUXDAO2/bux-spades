-- CRITICAL DATABASE INDEXES FOR PERFORMANCE OPTIMIZATION
-- These indexes will dramatically improve query performance for game operations

-- Indexes for Trick queries (most critical for performance)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trick_roundid_tricknumber ON "Trick"("roundId", "trickNumber");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trick_roundid_winningseat ON "Trick"("roundId", "winningSeatIndex");

-- Indexes for TrickCard queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trickcard_trickid_playorder ON "TrickCard"("trickId", "playOrder");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trickcard_trickid_seatindex ON "TrickCard"("trickId", "seatIndex");

-- Indexes for PlayerRoundStats queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_playerroundstats_roundid_seatindex ON "PlayerRoundStats"("roundId", "seatIndex");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_playerroundstats_roundid_teamindex ON "PlayerRoundStats"("roundId", "teamIndex");

-- Indexes for RoundBid queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_roundbid_roundid_seatindex ON "RoundBid"("roundId", "seatIndex");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_roundbid_roundid_userid ON "RoundBid"("roundId", "userId");

-- Indexes for Round queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_round_gameid_roundnumber ON "Round"("gameId", "roundNumber");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_round_gameid_dealerseat ON "Round"("gameId", "dealerSeatIndex");

-- Indexes for GamePlayer queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gameplayer_gameid_seatindex ON "GamePlayer"("gameId", "seatIndex");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gameplayer_gameid_userid ON "GamePlayer"("gameId", "userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gameplayer_gameid_teamindex ON "GamePlayer"("gameId", "teamIndex");

-- Indexes for RoundScore queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_roundscore_roundid ON "RoundScore"("roundId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_roundscore_round_gameid ON "RoundScore"("roundId") INCLUDE ("Round");

-- Indexes for Game queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_game_status ON "Game"("status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_game_createdat ON "Game"("createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_game_isleague ON "Game"("isLeague");

-- Indexes for User queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_username ON "User"("username");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_discordid ON "User"("discordId");

-- Composite indexes for complex queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trick_complete ON "Trick"("roundId", "trickNumber", "winningSeatIndex");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_playerstats_complete ON "PlayerRoundStats"("roundId", "seatIndex", "tricksWon");

-- Partial indexes for active games
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_game_active ON "Game"("status") WHERE "status" IN ('WAITING', 'BIDDING', 'PLAYING');

-- Indexes for foreign key lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_roundhandsnapshot_roundid ON "RoundHandSnapshot"("roundId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_eventgame_gameid ON "EventGame"("gameId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gameresult_gameid ON "GameResult"("gameId");

-- Analyze tables to update statistics
ANALYZE "Game";
ANALYZE "GamePlayer";
ANALYZE "Round";
ANALYZE "Trick";
ANALYZE "TrickCard";
ANALYZE "PlayerRoundStats";
ANALYZE "RoundBid";
ANALYZE "RoundScore";
ANALYZE "User";
