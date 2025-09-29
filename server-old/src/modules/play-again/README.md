# Play Again Module

Handles the play again functionality for completed games, supporting both league and non-league game modes.

## Features

### League Games (`league: true`)
- **Requires all 4 players** to click "Play Again" before resetting
- If all players respond, the game resets with the same players
- If not all players respond within the client-side timer, the game doesn't reset

### Non-League Games (`league: false`)
- **Requires all human players** to either click "Play Again" or leave the table
- If all human players respond, the game resets with only responding players
- Non-responding players are removed from the game
- If no human players remain, the game is closed
- Bots are removed and empty seats are available for new players to join

## Socket Events

### `play_again`
**Client → Server**
```typescript
{
  gameId: string
}
```

**Server Response:**
- `play_again_confirmed` - Confirmation that the player's response was received
- `game_reset` - Game has been reset and is ready to start again
- `game_closed` - Game was closed (no human players remaining)
- `error` - Error occurred

## Game Reset Process

When a game is reset:

1. **Game State Reset:**
   - Status: `FINISHED` → `WAITING`
   - Current round: Reset to 1
   - Current trick: Reset to 1
   - Dealer: Reset to 0
   - Player scores, bids, tricks: All reset to 0

2. **Database Update:**
   - Game status: `FINISHED` → `WAITING`
   - Completed flag: `true` → `false`
   - Current round/trick: Reset to 1/1
   - Dealer: Reset to 0

3. **Cleanup:**
   - Trick logger cleared for the game
   - Play again responses cleared
   - Game state objects cleared (hands, bidding, play, etc.)

4. **Player Management (Non-League Only):**
   - Non-responding human players removed
   - Empty seats available for new players
   - Bots removed (can be re-added when game starts)

## Integration Points

- **Connection Management:** Handles player disconnections during play again phase
- **Game Completion:** Triggered when `game_over` event is emitted
- **Socket Handlers:** Processes `play_again` socket events
- **Database:** Updates game status and clears trick logging

## Usage

```typescript
import { handlePlayAgain, handlePlayerLeaveDuringPlayAgain } from './modules/play-again';

// Handle play again event
socket.on('play_again', (data) => handlePlayAgain(socket, data));

// Handle player leaving during play again phase
handlePlayerLeaveDuringPlayAgain(gameId, userId);
```
