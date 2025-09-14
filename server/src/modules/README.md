# Game Modules

This directory contains the modularized game logic, organized by functionality for easier maintenance and debugging.

## Module Structure

### 🃏 `dealing/`
**Card dealing and deck management**
- `cardDealing.ts` - Deck creation, shuffling, dealing cards, dealer assignment
- Functions: `createDeck()`, `shuffle()`, `dealCards()`, `assignDealer()`, `dealNewHand()`

### 🤖 `bot-play/`
**Bot AI and automated gameplay**
- `botLogic.ts` - Bot bidding, card selection, move automation
- Functions: `botMakeMove()`, `botPlayCard()`, `calculateBotBid()`, `selectBestCard()`

### 📋 `game-rules/`
**Game rules, validation, and scoring**
- `gameRules.ts` - Rule validation, card play validation, scoring, game completion
- Functions: `validateGameSettings()`, `canPlayCard()`, `determineTrickWinner()`, `calculateSoloHandScore()`

### 🔌 `socket-handlers/`
**Socket event handling and game flow**
- `gameSocketHandlers.ts` - Socket event handlers for game actions
- Functions: `handleJoinGame()`, `handleMakeBid()`, `handlePlayCard()`, `handleBiddingComplete()`

### ⏰ `timeout-management/`
**Player timeout handling and automation**
- `timeoutManager.ts` - Timeout tracking, auto-moves, consecutive timeout handling
- Functions: `startTurnTimeout()`, `clearTurnTimeout()`, `handlePlayerTimeout()`

## Usage

Import from the main modules index:

```typescript
import { 
  dealCards, 
  botMakeMove, 
  validateGameSettings,
  handleJoinGame,
  startTurnTimeout 
} from './modules';
```

Or import from specific modules:

```typescript
import { dealCards } from './modules/dealing';
import { botMakeMove } from './modules/bot-play';
```

## Benefits

✅ **Easier Debugging** - Find issues quickly by looking in the right module  
✅ **Better Organization** - Related functionality grouped together  
✅ **Maintainable Code** - Smaller, focused files instead of massive monoliths  
✅ **Reusable Components** - Modules can be easily imported and reused  
✅ **Clear Responsibilities** - Each module has a single, clear purpose  

## Migration Status

- ✅ **Dealing Module** - Complete
- ✅ **Bot Play Module** - Complete  
- ✅ **Game Rules Module** - Complete
- ✅ **Socket Handlers Module** - Complete
- ✅ **Timeout Management Module** - Complete
- 🔄 **Integration** - In progress (updating main files to use modules)
- ⏳ **Hand Completion Module** - Planned
- ⏳ **Game Completion Module** - Planned
- ⏳ **Database Logging Module** - Planned
- ⏳ **Game Formats Module** - Planned

## Next Steps

1. Update `server/src/index.ts` to use the new modules
2. Update `server/src/routes/games.routes.ts` to use the new modules
3. Create remaining modules (hand completion, game completion, etc.)
4. Remove duplicate code from original files
5. Test all functionality works with new modular structure
