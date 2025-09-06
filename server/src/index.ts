// Main server entry point - now modularized
import { app, httpServer, io } from './server';
import { setupSocketAuthentication } from './socket/authentication';
import { setupConnectionHandlers } from './socket/connectionHandlers';
// import { setupGameEventHandlers } from './socket/gameEventHandlers';
import { setupGameLogic } from './game-logic/gameLogic';

// Setup socket authentication
setupSocketAuthentication(io);

// Setup connection handlers
setupConnectionHandlers(io);

// Setup game event handlers
// setupGameEventHandlers(io);

// Setup game logic
setupGameLogic();

console.log('✅ Server modules loaded successfully');
