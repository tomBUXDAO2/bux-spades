const io = require('socket.io-client');
const jwt = require('jsonwebtoken');
const axios = require('axios');

// Test script to reproduce the game finish issue
async function testGameFlow() {
  console.log('Starting game flow test...');
  
  // Create a test JWT token (using the same secret as the server)
  const testUserId = 'test-user-' + Date.now();
  const token = jwt.sign({ userId: testUserId }, 'kdfhekjjasuiwkgiqwoirjh4538wiwkfnjfkjewjriigernkwegiuhewfe');
  
  try {
    // Create a test game via HTTP API
    console.log('Creating game via HTTP API...');
    const gameResponse = await axios.post('http://localhost:3000/api/games', {
      creatorId: testUserId,
      creatorName: 'Test User',
      mode: 'PARTNERS',
      format: 'REGULAR',
      isRated: false,
      maxPoints: 500,
      minPoints: -200,
      nilAllowed: true,
      blindNilAllowed: false
    });
    
    console.log('Game creation response:', gameResponse.data);
    const gameId = gameResponse.data.gameId || gameResponse.data.id;
    console.log('Game created with ID:', gameId);
    
    // Now connect via socket and join the game
    const socket = io('http://localhost:3000', {
      transports: ['polling', 'websocket']
    });

    socket.on('connect', () => {
      console.log('Connected to server');
      
      // First authenticate
      socket.emit('authenticate', { token });
    });

    socket.on('authenticated', (data) => {
      console.log('Authenticated as user:', data.userId);
      
      // Join the game
      socket.emit('join_game', {
        gameId: gameId,
        seatIndex: 0
      });
    });

    socket.on('auth_error', (error) => {
      console.error('Authentication failed:', error);
      socket.disconnect();
      process.exit(1);
    });

    socket.on('game_joined', (data) => {
      console.log('Joined game:', data);
      
      // Start the game
      socket.emit('start_game', {
        gameId: gameId
      });
    });

    socket.on('game_started', (data) => {
      console.log('Game started:', data);
      
      // Wait a moment then start playing cards
      setTimeout(() => {
        playCards(gameId);
      }, 1000);
    });

    socket.on('bid_made', (data) => {
      console.log('Bid made:', data);
    });

    socket.on('card_played', (data) => {
      console.log('Card played:', data);
    });

    socket.on('trick_complete', (data) => {
      console.log('Trick complete:', data);
    });

    socket.on('round_complete', (data) => {
      console.log('Round complete:', data);
    });

    socket.on('game_complete', (data) => {
      console.log('GAME COMPLETE!', data);
      checkGameStatus(gameId);
    });

    // Play some cards to trigger the bug
    async function playCards(gameId) {
      try {
        // First make a bid
        console.log('Making bid...');
        socket.emit('make_bid', {
          gameId: gameId,
          bid: 3
        });

        // Wait for bidding to complete, then play cards
        setTimeout(async () => {
          console.log('Playing first card...');
          socket.emit('play_card', {
            gameId: gameId,
            card: { suit: 'H', rank: 'A' }
          });

          // Check database after each card
          setTimeout(() => {
            checkGameStatus(gameId);
          }, 2000);
        }, 2000);
      } catch (error) {
        console.error('Error playing cards:', error);
      }
    }

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    // Check game status in database
    async function checkGameStatus(gameId) {
      try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        const dbUrl = 'postgresql://spades_owner:npg_uKzm7BqeL5Iw@ep-holy-truth-abamc73q-pooler.eu-west-2.aws.neon.tech/spades?sslmode=require&channel_binding=require';
        
        const { stdout } = await execAsync(`psql "${dbUrl}" -c "SELECT id, status, \"createdAt\", \"startedAt\", \"finishedAt\" FROM \\"Game\\" WHERE id = '${gameId}';"`);
        
        console.log('Game status in database:');
        console.log(stdout);
        
        socket.disconnect();
        process.exit(0);
      } catch (error) {
        console.error('Error checking database:', error);
        socket.disconnect();
        process.exit(1);
      }
    }
    
  } catch (error) {
    console.error('Error creating game:', error);
    process.exit(1);
  }
}

testGameFlow().catch(console.error);