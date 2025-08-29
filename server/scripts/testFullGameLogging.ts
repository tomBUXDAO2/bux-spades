import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function testFullGameLogging() {
  console.log('🧪 Starting full game logging test...');
  
  const gameId = `test_full_game_${Date.now()}`;
  
  try {
    // 1. Create a game in the database
    console.log('📝 Creating test game in database...');
          const game = await prisma.game.create({
        data: {
          id: gameId,
          creatorId: 'cmeoh9akw00ek5vv5nzcmsodb', // Use existing user
          gameMode: 'PARTNERS',
          bidType: 'REGULAR',
          specialRules: [],
          minPoints: -100,
          maxPoints: 100,
          buyIn: 1000,
          rated: false, // Bot game, not rated
          league: false, // Not a league game
          status: 'WAITING',
          allowNil: true,
          allowBlindNil: false,
          updatedAt: new Date()
        }
      });
    
    console.log('✅ Game created:', { id: game.id, rated: game.rated, league: game.league });
    
    // 2. Create game players
    console.log('👥 Creating game players...');
    const players = [
      { userId: 'cmeoh9akw00ek5vv5nzcmsodb', username: 'TestPlayer1', position: 0, team: 0 },
      { userId: 'cmeuag1k90000xq2elg76fr5a', username: 'Bot1', position: 1, team: 1 },
      { userId: 'cmervaobj0003krk7msha13vm', username: 'Bot2', position: 2, team: 0 },
      { userId: 'cmeuj8j5001v9xq2euwknxz2r', username: 'Bot3', position: 3, team: 1 }
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
          discordId: null,
          updatedAt: new Date()
        }
      });
    }
    
    console.log('✅ Game players created');
    
    // 3. Start round 1
    console.log('🔄 Starting round 1...');
    const round1 = await prisma.round.create({
      data: {
        id: uuidv4(),
        gameId: gameId,
        roundNumber: 1,
        updatedAt: new Date()
      }
    });
    
    console.log('✅ Round 1 created:', round1.id);
    
    // 4. Create some tricks
    console.log('🎴 Creating test tricks...');
    for (let trickNum = 1; trickNum <= 3; trickNum++) {
      const trick = await prisma.trick.create({
        data: {
          id: uuidv4(),
          roundId: round1.id,
          leadPlayerId: players[trickNum % 4].userId,
          winningPlayerId: players[trickNum % 4].userId,
          trickNumber: trickNum,
          updatedAt: new Date()
        }
      });
      
      // Add some cards to each trick
      for (let cardPos = 0; cardPos < 4; cardPos++) {
        await prisma.card.create({
          data: {
            id: uuidv4(),
            trickId: trick.id,
            playerId: players[cardPos].userId,
            suit: 'HEARTS',
            value: cardPos + 1,
            position: cardPos,
            updatedAt: new Date()
          }
        });
      }
      
      console.log(`✅ Trick ${trickNum} created with 4 cards`);
    }
    
    // 5. Complete the round
    console.log('🏁 Completing round 1...');
    await prisma.round.update({
      where: { id: round1.id },
      data: { updatedAt: new Date() }
    });
    
    // 6. Start round 2
    console.log('🔄 Starting round 2...');
    const round2 = await prisma.round.create({
      data: {
        id: uuidv4(),
        gameId: gameId,
        roundNumber: 2,
        updatedAt: new Date()
      }
    });
    
    console.log('✅ Round 2 created:', round2.id);
    
    // 7. Create one more trick in round 2
    const finalTrick = await prisma.trick.create({
      data: {
        id: uuidv4(),
        roundId: round2.id,
        leadPlayerId: players[0].userId,
        winningPlayerId: players[0].userId,
        trickNumber: 1,
        updatedAt: new Date()
      }
    });
    
    // Add cards to final trick
    for (let cardPos = 0; cardPos < 4; cardPos++) {
      await prisma.card.create({
        data: {
          id: uuidv4(),
          trickId: finalTrick.id,
          playerId: players[cardPos].userId,
          suit: 'SPADES',
          value: cardPos + 1,
          position: cardPos,
          updatedAt: new Date()
        }
      });
    }
    
    console.log('✅ Final trick created with 4 cards');
    
    // 8. Complete the game
    console.log('🏁 Completing game...');
    await prisma.game.update({
      where: { id: gameId },
      data: { 
        status: 'FINISHED',
        updatedAt: new Date()
      }
    });
    
    // 9. Create game result
    console.log('📊 Creating game result...');
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
            { position: 0, userId: players[0].userId, username: 'TestPlayer1', finalScore: 50, finalBags: 2, finalPoints: 50, won: true },
            { position: 1, userId: players[1].userId, username: 'Bot1', finalScore: -50, finalBags: 1, finalPoints: -50, won: false },
            { position: 2, userId: players[2].userId, username: 'Bot2', finalScore: 50, finalBags: 2, finalPoints: 50, won: true },
            { position: 3, userId: players[3].userId, username: 'Bot3', finalScore: -50, finalBags: 1, finalPoints: -50, won: false }
          ]
        },
        totalRounds: 2,
        totalTricks: 4,
        specialEvents: {},
        updatedAt: new Date()
      }
    });
    
    console.log('✅ Game result created');
    
    // 10. Verify everything was logged
    console.log('🔍 Verifying database logging...');
    
    const finalGame = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        GamePlayer: true,
        Round: {
          include: {
            Trick: {
              include: {
                Card: true
              }
            }
          }
        },
        GameResult: true
      }
    });
    
    if (!finalGame) {
      throw new Error('Game not found in database!');
    }
    
    console.log('📊 Final verification results:');
    console.log(`- Game: ${finalGame.id} (${finalGame.status})`);
    console.log(`- Players: ${finalGame.GamePlayer.length}`);
    console.log(`- Rounds: ${finalGame.Round.length}`);
    console.log(`- Total Tricks: ${finalGame.Round.reduce((sum, round) => sum + round.Trick.length, 0)}`);
    console.log(`- Total Cards: ${finalGame.Round.reduce((sum, round) => sum + round.Trick.reduce((trickSum, trick) => trickSum + trick.Card.length, 0), 0)}`);
    console.log(`- Game Result: ${finalGame.GameResult ? '✅ Created' : '❌ Missing'}`);
    
    console.log('🎉 Full game logging test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testFullGameLogging(); 