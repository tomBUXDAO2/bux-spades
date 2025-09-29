# Improved Spades Game Architecture

## Key Improvements

### 1. Dynamic Stats Calculation
- **Before**: Massive `UserStats` table with 100+ redundant fields that required manual updates
- **After**: Minimal `UserStats` table with basic aggregated data, all detailed stats calculated dynamically from game data using SQL aggregations

### 2. Single Source of Truth
- **Before**: Stats stored in multiple places, prone to inconsistency
- **After**: All stats calculated from actual game data (`PlayerRoundStats`, `GameResult`, etc.)

### 3. Two Game Creation Paths

#### App Games (Frontend)
- **Rated Games**: 4 human players → `isRated: true, isLeague: false`
- **Unrated Games**: 1+ bot players → `isRated: false, isLeague: false`

#### Discord Command Games
- **Always**: 4 human players, `isRated: true, isLeague: true`
- **Creation Flow**: 
  1. `/creategame` command creates game with all 4 players pre-assigned
  2. Game created in DB but players need to join table on frontend
  3. Game only starts when all 4 players join the table

### 4. Clean Database Schema

#### Core Models
- `User`: Basic user info
- `UserStats`: Minimal aggregated stats (games played, won, coins)
- `Game`: Game metadata and live state
- `GamePlayer`: Player participation in games
- `Round`: Individual hands/rounds
- `RoundBid`: Player bids per round
- `Trick`: Individual tricks within rounds
- `TrickCard`: Cards played in tricks
- `PlayerRoundStats`: Stats per player per round
- `GameResult`: Final game results
- `DiscordGame`: Discord command game metadata

#### Stats Calculation
```sql
-- Example: Get user win rate
SELECT 
  COUNT(CASE WHEN gr.winner = gp.userId THEN 1 END) as games_won,
  COUNT(*) as total_games,
  (COUNT(CASE WHEN gr.winner = gp.userId THEN 1 END)::float / COUNT(*)) * 100 as win_rate
FROM GamePlayer gp
JOIN Game g ON gp.gameId = g.id
LEFT JOIN GameResult gr ON g.id = gr.gameId
WHERE gp.userId = ? AND g.status = 'FINISHED'
```

### 5. Discord Commands

#### `/creategame`
- Creates league game with 4 specific players
- Game appears on frontend but players must join table
- Always rated and league

#### `/userstats`
- Shows user statistics with filters (format, mode)
- Calculated in real-time from game data
- No cached/stale data

#### `/leaderboard`
- Shows top players with filters
- Calculated in real-time from game data
- Sortable by win rate, games played, etc.

#### `/activegames`
- Shows currently active games
- Useful for monitoring

### 6. Benefits

#### Performance
- No more massive stats updates after each game
- Stats calculated only when requested
- Smaller database footprint

#### Reliability
- Single source of truth for all data
- No sync issues between cached stats and actual data
- Automatic consistency

#### Flexibility
- Easy to add new stat types without schema changes
- Can filter stats by any combination of criteria
- Real-time accuracy

#### Maintainability
- Cleaner codebase
- Easier to debug
- Less complex state management

### 7. Migration Strategy

1. **Phase 1**: Deploy new schema alongside old one
2. **Phase 2**: Migrate existing data to new structure
3. **Phase 3**: Remove old `UserStats` fields
4. **Phase 4**: Update frontend to use new stats API

### 8. API Changes

#### Before
```javascript
// Cached stats - could be stale
GET /api/users/:id/stats
```

#### After
```javascript
// Real-time calculated stats
GET /api/users/:id/stats?format=REGULAR&mode=PARTNERS&league=true
```

This architecture eliminates the complexity and reliability issues of the current system while providing more accurate, real-time statistics and a cleaner codebase.
