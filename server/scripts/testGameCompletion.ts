import { logCompletedGameToDbAndDiscord } from '../src/lib/gameLogger';

async function testGameCompletion() {
  try {
    console.log('Testing game completion with Discord embed...');
    
    // Create a mock game object that matches the real Game interface
    const mockGame = {
      id: 'test-game-123',
      dbGameId: 'test-game-123',
      gameMode: 'PARTNERS',
      team1TotalScore: 350,
      team2TotalScore: 100,
      playerScores: [350, 100, 350, 100],
      rules: {
        bidType: 'REGULAR'
      },
      specialRules: {},
      league: true, // This should trigger Discord embed
      buyIn: 200000,
      maxPoints: 350,
      minPoints: -100,
      players: [
        { id: 'user1', discordId: '931160720261939230', username: 'Player1', type: 'human' },
        { id: 'user2', discordId: '1195400053964161055', username: 'Player2', type: 'human' },
        { id: 'user3', discordId: '1403863570415882382', username: 'Player3', type: 'human' },
        { id: 'user4', discordId: '577901812246511637', username: 'Player4', type: 'human' }
      ],
      // Add other required properties
      status: 'FINISHED' as const,
      completedTricks: [] as any[],
      spectators: [] as any[],
      forcedBid: 'NONE' as const,
      isBotGame: false,
      createdAt: Date.now()
    };
    
    console.log('Mock game league property:', mockGame.league);
    console.log('Mock game object keys:', Object.keys(mockGame));
    
    // Test if the league property is preserved through JSON serialization
    const serialized = JSON.stringify(mockGame);
    const deserialized = JSON.parse(serialized);
    console.log('After JSON serialization/deserialization, league property:', deserialized.league);
    
    // Trigger the game completion
    await logCompletedGameToDbAndDiscord(mockGame, 1); // Team 1 wins
    
    console.log('Game completion test finished!');
  } catch (error) {
    console.error('Error testing game completion:', error);
  }
}

testGameCompletion(); 