# Phantom Rounds Bug - Fix Documentation

## The Problem

Games were creating "phantom rounds" - Round records in the database with PlayerRoundStats that had NULL bids and 0 tricks. These rounds were never actually played but were being counted in the game's round total.

### Example from Production
Game `game_1760479893596_s7das9dzj` had 9 Round records but only 3 were actually played:
- **Round 1**: PLAYED (has bids: 0, 2, 5, 3)
- **Round 2**: PHANTOM (all NULL bids, 0 tricks)
- **Round 3**: PHANTOM (all NULL bids, 0 tricks)  
- **Round 4**: PHANTOM (all NULL bids, 0 tricks)
- **Round 5**: PLAYED (has bids: 4, 0, 2, 4)
- **Round 6**: PHANTOM (all NULL bids, 0 tricks)
- **Round 7**: PHANTOM (all NULL bids, 0 tricks)
- **Round 8**: PHANTOM (all NULL bids, 0 tricks)
- **Round 9**: PLAYED (has bids: 0, 3, 6, 0)

This caused the game's `currentRound` to be 9 when only 3 hands were actually played.

## Root Cause

### 1. Round Number Calculation
In `TrickCompletionService.startNewRound()` (line 387):
```javascript
const nextRoundNumber = game.rounds.length + 1;
```

**Problem**: This calculated the next round number based on **how many Round records exist** in the database, not on how many rounds were actually completed.

If phantom rounds existed, the next round number would be inflated (e.g., if there were 4 rounds but only 1 was played, the next round would be 5, not 2).

### 2. No Validation
There was **no check** to ensure the current round was completed before creating a new one.

The `startNewRound()` function would:
1. Create a new Round record
2. Create PlayerRoundStats records with `bid: null`
3. Call `dealInitialHands()` which creates more PlayerRoundStats records

If this function was called multiple times (due to errors, retries, or client bugs), it would create multiple phantom rounds.

### 3. Trigger Points
`startNewRound()` is called when:
- Client sends `hand_summary_continue` socket event after viewing the hand summary
- This could be sent multiple times if there were connection issues or client bugs
- No idempotency protection existed

## The Fix

### Changes Made in `TrickCompletionService.js`

#### 1. Use `currentRound` instead of `rounds.length` (line 389)
```javascript
// BEFORE:
const nextRoundNumber = game.rounds.length + 1;

// AFTER:
const nextRoundNumber = (game.currentRound || 0) + 1;
```

**Why**: `currentRound` in the Game table represents the **actual** current round number, not the number of Round records. This prevents phantom rounds from affecting the round count.

#### 2. Add Validation Guard (lines 391-406)
```javascript
// CRITICAL FIX: Check if the current round has been completed before creating a new one
// A round is only complete if all PlayerRoundStats have non-null bids
if (game.currentRound && game.currentRound > 0) {
  const currentRound = game.rounds.find(r => r.roundNumber === game.currentRound);
  if (currentRound) {
    const stats = await prisma.playerRoundStats.findMany({
      where: { roundId: currentRound.id }
    });
    
    const incompleteBids = stats.filter(s => s.bid === null);
    if (incompleteBids.length > 0) {
      console.error(`[TRICK COMPLETION] ERROR: Cannot start new round - current round ${game.currentRound} has ${incompleteBids.length} players with incomplete bids`);
      throw new Error(`Current round ${game.currentRound} not complete - ${incompleteBids.length} players haven't bid yet`);
    }
  }
}
```

**Why**: This prevents creating a new round if the current one hasn't been completed (all players must have bid). This adds idempotency - if `startNewRound()` is called multiple times, it will fail on the second attempt.

#### 3. Add Logging (line 408)
```javascript
console.log(`[TRICK COMPLETION] Creating round ${nextRoundNumber} (currentRound: ${game.currentRound}, existing rounds: ${game.rounds.length})`);
```

**Why**: Helps debug round creation and identify when phantom rounds might be created.

## Cleanup Script

Created `server/cleanup-phantom-rounds.js` to identify and optionally delete phantom rounds from existing games.

### Usage
```bash
cd server
node cleanup-phantom-rounds.js
```

This will:
1. Find all PlayerRoundStats with NULL bids
2. Group them by game and round
3. Display what would be deleted
4. Optionally delete them (uncomment the deletion code)

## Impact

### Before Fix
- Phantom rounds accumulated in games
- Round numbers became inflated
- Stats aggregation could count NULL bids incorrectly
- Game completion logic might be affected

### After Fix
- New phantom rounds cannot be created
- `currentRound` always reflects actual gameplay
- Attempting to start a new round before completing the current one fails gracefully
- Better error messages for debugging

## Related Issues

### Nil Tracking
The investigation started because nil bids weren't showing in player stats. We discovered:

1. **Nil bids ARE being tracked correctly** in the database:
   - `madeNil` and `madeBlindNil` fields are set properly
   - The data exists in PlayerRoundStats

2. **The issue is likely in StatsService**: The stats aggregation service may not be reading these fields correctly when calculating user stats.

### Next Steps
1. Deploy this fix to prevent new phantom rounds
2. Run cleanup script on production to remove existing phantom rounds
3. Investigate StatsService to fix nil stats aggregation
4. Consider adding database constraints to prevent NULL bids in completed rounds

## Testing

### Test 1: Normal Round Completion
1. Complete a round normally
2. Click "Continue" on hand summary
3. **Verify**: New round is created with correct round number
4. **Verify**: PlayerRoundStats are created for new round

### Test 2: Double Click Prevention
1. Complete a round normally  
2. Click "Continue" twice quickly on hand summary
3. **Verify**: Only one new round is created
4. **Verify**: Second attempt fails with error message

### Test 3: Incomplete Round Protection
1. Start a round (don't complete bidding)
2. Try to trigger `startNewRound()` via socket event
3. **Verify**: Function throws error
4. **Verify**: No new round is created

## Files Modified
- `/Users/tombuxdao/bux-spades/server/src/services/TrickCompletionService.js`
  - Lines 387-408: Round number calculation and validation logic

## Files Created
- `/Users/tombuxdao/bux-spades/server/cleanup-phantom-rounds.js`
  - Utility script to identify and remove phantom rounds

- `/Users/tombuxdao/bux-spades/PHANTOM_ROUNDS_FIX.md`
  - This documentation file

