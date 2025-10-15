# Stats Calculation Bugs - Fix Documentation

## The Problems

### 1. Nil Stats Not Showing Attempts
Player stats were not showing nil attempts or correct nil success rates. Only successful nils were being counted, and failed nil attempts were completely ignored.

### 2. Bags Per Game Calculation Wrong
Bags per game was being calculated by dividing by rounds played instead of games played, causing incorrect values (e.g., 2 bags / 9 rounds = 0.22 instead of 2 bags / 1 game = 2.0).

### Examples from Production

**Game**: `game_1760479893596_s7das9dzj`

**Nil Stats Bug:**
Tom bid nil twice:
- **Round 1**: Bid 0, Tricks 0 → **Nil Made ✓**
- **Round 9**: Bid 0, Tricks 1 → **Nil Failed ✗**

But stats only showed 1 nil bid and 1 nil made (100% success rate) instead of 2 nil bids and 1 nil made (50% success rate).

**Bags Per Game Bug:**
Sandy M played 1 game with 2 bags total:
- Game had 9 Round records (but 6 were phantom rounds)
- Calculation: 2 bags / 9 rounds = 0.22 → **displayed 0.2 bags/game** ❌
- Should be: 2 bags / 1 game = **2.0 bags/game** ✅

## Root Cause

### In StatsService.js (lines 43-62)
```javascript
// BEFORE (BUGGY):
const nilStats = await prisma.playerRoundStats.count({
  where: {
    userId,
    madeNil: true,  // ❌ Only counts successful nils
    round: {
      game: gameFilter
    }
  }
});

// Both nilsBid and nilsMade were set to the same value!
nilsBid: nilStats,
nilsMade: nilStats
```

**Problem**: It was counting `madeNil: true` for both "nils bid" and "nils made", which means:
- Only successful nils were counted as attempts
- Failed nils were completely ignored
- Success rate was always 100% or 0%

### In DetailedStatsService.js (lines 152-208)
Same bug - counting `madeNil: true` and `madeBlindNil: true` for both attempts and successes.

### In DetailedStatsService.js - Bags Per Game (line 230)
```javascript
// BEFORE (BUGGY):
const bagsPerGame = roundsPlayed > 0 ? totalBags / roundsPlayed : 0;
```

**Problem**: Dividing by rounds played instead of games played. Since games can have varying numbers of rounds (especially with phantom rounds), this gave completely wrong values.

## The Fix

### Changed Logic

**For Nil Attempts**: Count where `bid = 0` AND `isBlindNil = false`
- This captures ALL nil bids, whether successful or failed

**For Nils Made**: Count where `madeNil = true` (unchanged)
- This captures only successful nils

**For Blind Nil Attempts**: Count where `isBlindNil = true`
- This captures ALL blind nil bids, whether successful or failed

**For Blind Nils Made**: Count where `madeBlindNil = true` (unchanged)
- This captures only successful blind nils

**For Bags Per Game**: Divide total bags by games played, not rounds played
- Count games via `GamePlayer` table instead of counting `PlayerRoundStats` records

### Changes in StatsService.js (lines 43-84, 115-131)

```javascript
// AFTER (FIXED):
const nilAttempts = await prisma.playerRoundStats.count({
  where: {
    userId,
    bid: 0,
    isBlindNil: false,
    round: {
      game: gameFilter
    }
  }
});

const nilsMade = await prisma.playerRoundStats.count({
  where: {
    userId,
    madeNil: true,
    round: {
      game: gameFilter
    }
  }
});

const blindNilAttempts = await prisma.playerRoundStats.count({
  where: {
    userId,
    isBlindNil: true,
    round: {
      game: gameFilter
    }
  }
});

const blindNilsMade = await prisma.playerRoundStats.count({
  where: {
    userId,
    madeBlindNil: true,
    round: {
      game: gameFilter
    }
  }
});

// Calculate actual success rates
const nilRate = nilAttempts > 0 ? (nilsMade / nilAttempts) * 100 : 0;
const blindNilRate = blindNilAttempts > 0 ? (blindNilsMade / blindNilAttempts) * 100 : 0;

return {
  // ...
  nilsBid: nilAttempts,
  nilsMade: nilsMade,
  nilRate,
  blindNilsBid: blindNilAttempts,
  blindNilsMade: blindNilsMade,
  blindNilRate,
  // ...
};
```

### Changes in DetailedStatsService.js (lines 151-243)

Same nil counting logic applied to `getNilStats()` method.

**Bags Per Game Fix (lines 228-237):**
```javascript
// BEFORE (BUGGY):
const roundsPlayed = bagsStats._count.id;
const bagsPerGame = roundsPlayed > 0 ? totalBags / roundsPlayed : 0;

// AFTER (FIXED):
const gamesPlayed = await prisma.gamePlayer.count({
  where: {
    userId,
    game: gameWhere
  }
});
const bagsPerGame = gamesPlayed > 0 ? totalBags / gamesPlayed : 0;
```

## Impact

### Before Fix
- Only successful nils counted as attempts
- Failed nils completely ignored
- Nil success rate always 100% (if any nils made) or 0% (if no nils made)
- Players with 10 nil attempts and 5 successes showed as "5 attempts, 5 made (100%)"
- Bags per game divided by rounds instead of games (e.g., 2 bags / 9 rounds = 0.2)
- Bags per game especially wrong for games with phantom rounds

### After Fix
- All nil attempts counted (successful or failed)
- Accurate success rate calculated
- Players with 10 nil attempts and 5 successes now show as "10 attempts, 5 made (50%)"
- Bags per game now correctly divides by games played (e.g., 2 bags / 1 game = 2.0)
- Historical data will now display correctly

## Data Integrity

**Good News**: The underlying data in `PlayerRoundStats` is correct!
- `bid` field contains the actual bid (0 for nil)
- `isBlindNil` flag is set correctly
- `madeNil` and `madeBlindNil` are calculated correctly
- `tricksWon` is accurate

The bug was **only in the aggregation logic**, not in data storage. This means once deployed, all historical stats will immediately show correctly without any data migration needed.

## Testing

### Test Case 1: Player with Mixed Nil Results
Player bids nil 5 times:
- 3 successful (0 tricks)
- 2 failed (1+ tricks)

**Before**: Shows "3 nils bid, 3 made (100%)"
**After**: Shows "5 nils bid, 3 made (60%)"

### Test Case 2: Player with All Failed Nils
Player bids nil 3 times, all failed (1+ tricks each)

**Before**: Shows "0 nils bid, 0 made"
**After**: Shows "3 nils bid, 0 made (0%)"

### Test Case 3: Blind Nils
Same logic applies to blind nil tracking

### Verification Query
```sql
-- Check a specific user's nil stats
SELECT 
  COUNT(CASE WHEN bid = 0 AND "isBlindNil" = false THEN 1 END) as nil_attempts,
  COUNT(CASE WHEN "madeNil" = true THEN 1 END) as nils_made,
  COUNT(CASE WHEN "isBlindNil" = true THEN 1 END) as blind_nil_attempts,
  COUNT(CASE WHEN "madeBlindNil" = true THEN 1 END) as blind_nils_made
FROM "PlayerRoundStats" prs
INNER JOIN "Round" r ON prs."roundId" = r.id
INNER JOIN "Game" g ON r."gameId" = g.id
WHERE prs."userId" = 'USER_ID_HERE'
  AND g.status = 'FINISHED';
```

## Related Issues

This fix addresses the nil stats issue. Two other issues were discovered during investigation:

1. **Phantom Rounds Bug**: Fixed separately in `PHANTOM_ROUNDS_FIX.md`
2. **Stats Update Trigger**: Stats may need to be recalculated for existing users (they'll update automatically on next game completion)

## Files Modified

- `/Users/tombuxdao/bux-spades/server/src/services/StatsService.js`
  - Lines 43-84: Changed nil counting logic (count bid=0 instead of madeNil=true for attempts)
  - Lines 115-131: Updated return values and rate calculations

- `/Users/tombuxdao/bux-spades/server/src/services/DetailedStatsService.js`
  - Lines 151-209: Changed nil counting logic in `getNilStats()`
  - Lines 228-237: Fixed bags per game to divide by games played, not rounds played

## Deployment Notes

**No migration needed!** The fix is in the query logic only. Once deployed:
- All existing stats will immediately display correctly
- No need to recalculate or backfill data
- Historical games will show accurate nil stats retroactively

