import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function testDiscordGameLogging() {
  console.log('🎮 Testing Discord-style game logging...');
  
  const gameId = `discord_test_game_${Date.now()}`;
  
  try {
    // Simulate what the Discord bot sends
    const discordGameData = {
      id: gameId,
      creatorId: 'cmeoh9akw00ek5vv5nzcmsodb',
      gameMode: 'PARTNERS',
      bidType: 'REGULAR',
      specialRules: [] as any,
      minPoints: -100,
      maxPoints: 100,
      buyIn: 1000,
      rated: true, // Discord games are always rated
      league: true, // Discord games are league games
      status: 'WAITING',
      allowNil: true,
      allowBlindNil: false,
      updatedAt: new Date()
    };
    
    console.log('📝 Creating Discord-style game in database...');
    console.log('Discord game data:', {
      id: discordGameData.id,
      rated: discordGameData.rated,
      league: discordGameData.league
    });
    
    const game = await prisma.game.create({
      data: discordGameData as any
    });
    
    console.log('✅ Discord game created:', { 
      id: game.id, 
      rated: game.rated, 
      league: game.league,
      status: game.status 
    });
    
    // Create game players (4 human players for Discord game)
    console.log('👥 Creating Discord game players...');
    const players = [
      { userId: 'cmeoh9akw00ek5vv5nzcmsodb', username: 'DiscordPlayer1', position: 0, team: 0 },
      { userId: 'cmeuag1k90000xq2elg76fr5a', username: 'DiscordPlayer2', position: 1, team: 1 },
      { userId: 'cmervaobj0003krk7msha13vm', username: 'DiscordPlayer3', position: 2, team: 0 },
      { userId: 'cmeuj8j5001v9xq2euwknxz2r', username: 'DiscordPlayer4', position: 3, team: 1 }
    ];
    
    for (const player of players) {
      await prisma.gamePlayer.create({
        data: {
          id: uuidv4(),
          gameId: gameId,
          userId: player.userId,
          position: player.position,
          team: player.team,
          bid: null,
          bags: 0,
          points: 0,
          username: player.username,
          discordId: player.userId, // Discord games have Discord IDs
          updatedAt: new Date()
        }
      });
    }
    
    console.log('✅ Discord game players created');
    
    // Simulate game completion
    console.log('🏁 Completing Discord game...');
    await prisma.game.update({
      where: { id: gameId },
      data: { 
        status: 'FINISHED',
        updatedAt: new Date()
      }
    });
    
    // Create game result
    console.log('📊 Creating Discord game result...');
    await prisma.gameResult.create({
      data: {
        id: uuidv4(),
        gameId: gameId,
        winner: 0, // Team 0 wins
        finalScore: 100,
        gameDuration: 300000, // 5 minutes
        team1Score: 100,
        team2Score: -100,
        playerResults: {
          players: [
            { position: 0, userId: players[0].userId, username: 'DiscordPlayer1', finalScore: 50, finalBags: 2, finalPoints: 50, won: true },
            { position: 1, userId: players[1].userId, username: 'DiscordPlayer2', finalScore: -50, finalBags: 1, finalPoints: -50, won: false },
            { position: 2, userId: players[2].userId, username: 'DiscordPlayer3', finalScore: 50, finalBags: 2, finalPoints: 50, won: true },
            { position: 3, userId: players[3].userId, username: 'DiscordPlayer4', finalScore: -50, finalBags: 1, finalPoints: -50, won: false }
          ]
        },
        totalRounds: 1,
        totalTricks: 1,
        specialEvents: {},
        updatedAt: new Date()
      }
    });
    
    console.log('✅ Discord game result created');
    
    // Verify the final state
    const finalGame = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        GamePlayer: true,
        GameResult: true
      }
    });
    
    if (!finalGame) {
      throw new Error('Discord game not found in database!');
    }
    
    console.log('📊 Discord game verification results:');
    console.log(`- Game: ${finalGame.id} (${finalGame.status})`);
    console.log(`- Rated: ${finalGame.rated}`);
    console.log(`- League: ${finalGame.league}`);
    console.log(`- Players: ${finalGame.GamePlayer.length}`);
    console.log(`- Game Result: ${finalGame.GameResult ? '✅ Created' : '❌ Missing'}`);
    
    if (finalGame.rated && finalGame.league) {
      console.log('🎉 Discord game logging test PASSED! Game is correctly marked as rated and league.');
    } else {
      console.log('❌ Discord game logging test FAILED! Game is not correctly marked as rated and league.');
    }
    
  } catch (error) {
    console.error('❌ Discord game test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testDiscordGameLogging(); 