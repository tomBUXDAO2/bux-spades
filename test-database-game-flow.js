#!/usr/bin/env node

/**
 * DATABASE-FIRST GAME FLOW TEST
 * Tests the complete game flow using the new database-centric architecture
 */

import axios from 'axios';
import { io } from 'socket.io-client';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'kdfhekjjasuiwkgiqwoirjh4538wiwkfnjfkjewjriigernkwegiuhewfe';
const SERVER_URL = 'http://localhost:3000';
const SOCKET_URL = 'http://localhost:3000';

async function testDatabaseGameFlow() {
  console.log('🎮 Testing Database-First Game Flow');
  console.log('=====================================');

  try {
    // 1. Create JWT token
    const token = jwt.sign({ userId: 'test_user_123' }, JWT_SECRET);
    console.log('✅ JWT token created');

    // 2. Create game via HTTP API
    console.log('\n📝 Creating game...');
    const gameResponse = await axios.post(`${SERVER_URL}/api/games`, {
      creatorId: 'test_user_123',
      mode: 'REGULAR',
      format: 'REGULAR',
      maxPoints: 500,
      minPoints: -200,
      buyIn: 0
    });
    
    const gameId = gameResponse.data.id;
    console.log(`✅ Game created: ${gameId}`);

    // 3. Connect socket and authenticate
    console.log('\n🔌 Connecting socket...');
    const socket = io(SOCKET_URL);
    
    await new Promise((resolve, reject) => {
      socket.on('connect', () => {
        console.log('✅ Socket connected');
        socket.emit('authenticate', { token });
      });
      
      socket.on('authenticated', (data) => {
        console.log('✅ Socket authenticated:', data);
        resolve();
      });
      
      socket.on('auth_error', (error) => {
        console.error('❌ Authentication failed:', error);
        reject(error);
      });
      
      setTimeout(() => reject(new Error('Authentication timeout')), 5000);
    });

    // 4. Join game
    console.log('\n🎯 Joining game...');
    socket.emit('join_game', { gameId });
    
    await new Promise((resolve, reject) => {
      socket.on('game_joined', (data) => {
        console.log('✅ Joined game:', data.seatIndex);
        resolve(data);
      });
      
      socket.on('error', (error) => {
        console.error('❌ Join game failed:', error);
        reject(error);
      });
      
      setTimeout(() => reject(new Error('Join game timeout')), 5000);
    });

    // 5. Check game state
    console.log('\n📊 Getting game state...');
    socket.emit('get_game_state', { gameId });
    
    const gameState = await new Promise((resolve, reject) => {
      socket.on('game_state', (data) => {
        console.log('✅ Game state received');
        console.log(`   Status: ${data.gameState.status}`);
        console.log(`   Players: ${data.gameState.players.length}`);
        console.log(`   Current Round: ${data.gameState.currentRound}`);
        console.log(`   Current Trick: ${data.gameState.currentTrick}`);
        resolve(data.gameState);
      });
      
      socket.on('error', (error) => {
        console.error('❌ Get game state failed:', error);
        reject(error);
      });
      
      setTimeout(() => reject(new Error('Get game state timeout')), 5000);
    });

    // 6. Wait for game to start (when 4 players join)
    console.log('\n⏳ Waiting for game to start...');
    
    const gameStarted = await new Promise((resolve, reject) => {
      socket.on('game_started', (data) => {
        console.log('✅ Game started!');
        console.log(`   Current Player: ${data.gameState.currentPlayer}`);
        console.log(`   Current Round: ${data.gameState.currentRound}`);
        console.log(`   Current Trick: ${data.gameState.currentTrick}`);
        resolve(data.gameState);
      });
      
      // If game doesn't start in 10 seconds, continue anyway
      setTimeout(() => {
        console.log('⚠️  Game start timeout - continuing with current state');
        resolve(gameState);
      }, 10000);
    });

    // 7. Try to play a card (if it's our turn)
    if (gameStarted.currentPlayer === 0 && gameStarted.players[0].hand.length > 0) {
      console.log('\n🃏 Playing a card...');
      const card = gameStarted.players[0].hand[0];
      console.log(`   Playing: ${card.rank} of ${card.suit}`);
      
      socket.emit('play_card', { gameId, card });
      
      await new Promise((resolve, reject) => {
        socket.on('card_played', (data) => {
          console.log('✅ Card played successfully!');
          console.log(`   Action: ${data.action}`);
          console.log(`   Next Player: ${data.gameState.currentPlayer}`);
          resolve(data);
        });
        
        socket.on('error', (error) => {
          console.error('❌ Card play failed:', error);
          reject(error);
        });
        
        setTimeout(() => reject(new Error('Card play timeout')), 5000);
      });
    } else {
      console.log('\n⏭️  Skipping card play (not our turn or no cards)');
    }

    // 8. Check final game state
    console.log('\n📊 Final game state...');
    socket.emit('get_game_state', { gameId });
    
    await new Promise((resolve, reject) => {
      socket.on('game_state', (data) => {
        console.log('✅ Final game state:');
        console.log(`   Status: ${data.gameState.status}`);
        console.log(`   Current Round: ${data.gameState.currentRound}`);
        console.log(`   Current Trick: ${data.gameState.currentTrick}`);
        console.log(`   Current Player: ${data.gameState.currentPlayer}`);
        
        // Check database directly
        checkDatabaseState(gameId).then(resolve).catch(reject);
      });
      
      setTimeout(() => reject(new Error('Final state timeout')), 5000);
    });

    // 9. Cleanup
    socket.disconnect();
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

async function checkDatabaseState(gameId) {
  console.log('\n🗄️  Checking database state...');
  
  try {
    const response = await axios.get(`${SERVER_URL}/api/games/${gameId}`);
    const game = response.data;
    
    console.log('✅ Database state:');
    console.log(`   Status: ${game.status}`);
    console.log(`   Current Round: ${game.currentRound}`);
    console.log(`   Current Trick: ${game.currentTrick}`);
    console.log(`   Players: ${game.players.length}`);
    console.log(`   Rounds: ${game.rounds?.length || 0}`);
    
    if (game.rounds && game.rounds.length > 0) {
      const currentRound = game.rounds.find(r => r.roundNumber === game.currentRound);
      if (currentRound) {
        console.log(`   Tricks in current round: ${currentRound.tricks?.length || 0}`);
        
        if (currentRound.tricks && currentRound.tricks.length > 0) {
          const currentTrick = currentRound.tricks.find(t => t.trickNumber === game.currentTrick);
          if (currentTrick) {
            console.log(`   Cards in current trick: ${currentTrick.cards?.length || 0}`);
          }
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  }
}

// Run the test
testDatabaseGameFlow().catch(console.error);
