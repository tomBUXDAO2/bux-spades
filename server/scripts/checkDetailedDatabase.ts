import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDetailedDatabase() {
  console.log('🔍 Detailed Database Analysis...\n');

  try {
    // Check all tables
    console.log('📊 Database Table Counts:');
    console.log('========================');
    
    const users = await prisma.user.count();
    const userStats = await prisma.userStats.count();
    const games = await prisma.game.count();
    const gamePlayers = await prisma.gamePlayer.count();
    const gameResults = await prisma.gameResult.count();
    const rounds = await prisma.round.count();
    const tricks = await prisma.trick.count();
    const cards = await prisma.card.count();
    const friends = await prisma.friend.count();
    const blockedUsers = await prisma.blockedUser.count();

    console.log(`👤 Users: ${users}`);
    console.log(`📈 User Stats: ${userStats}`);
    console.log(`🎮 Games: ${games}`);
    console.log(`🎯 Game Players: ${gamePlayers}`);
    console.log(`🏆 Game Results: ${gameResults}`);
    console.log(`🔄 Rounds: ${rounds}`);
    console.log(`🃏 Tricks: ${tricks}`);
    console.log(`🂡 Cards: ${cards}`);
    console.log(`👥 Friends: ${friends}`);
    console.log(`🚫 Blocked Users: ${blockedUsers}\n`);

    // If there are games, show details
    if (games > 0) {
      console.log('🎮 Game Details:');
      console.log('================');
      const gameDetails = await prisma.game.findMany({
        include: {
          players: {
            include: {
              user: true
            }
          },
          rounds: {
            include: {
              tricks: {
                include: {
                  cards: true
                }
              }
            }
          },
          gameResult: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      gameDetails.forEach((game, index) => {
        console.log(`\nGame ${index + 1}:`);
        console.log(`  ID: ${game.id}`);
        console.log(`  Status: ${game.status}`);
        console.log(`  Mode: ${game.gameMode}`);
        console.log(`  Created: ${game.createdAt}`);
        console.log(`  Players: ${game.players.length}`);
        console.log(`  Rounds: ${game.rounds.length}`);
        
        let totalTricks = 0;
        let totalCards = 0;
        game.rounds.forEach(round => {
          totalTricks += round.tricks.length;
          round.tricks.forEach(trick => {
            totalCards += trick.cards.length;
          });
        });
        
        console.log(`  Total Tricks: ${totalTricks}`);
        console.log(`  Total Cards: ${totalCards}`);
        
        if (game.gameResult) {
          console.log(`  Winner: ${game.gameResult.winner}`);
          console.log(`  Final Score: ${game.gameResult.finalScore}`);
        }
      });
    }

    // If there are rounds, show details
    if (rounds > 0) {
      console.log('\n🔄 Round Details:');
      console.log('=================');
      const roundDetails = await prisma.round.findMany({
        include: {
          game: true,
          tricks: {
            include: {
              cards: true
            },
            orderBy: {
              trickNumber: 'asc'
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      roundDetails.forEach((round, index) => {
        console.log(`\nRound ${index + 1}:`);
        console.log(`  ID: ${round.id}`);
        console.log(`  Game ID: ${round.gameId}`);
        console.log(`  Round Number: ${round.roundNumber}`);
        console.log(`  Created: ${round.createdAt}`);
        console.log(`  Tricks: ${round.tricks.length}`);
        
        round.tricks.forEach(trick => {
          console.log(`    Trick ${trick.trickNumber}: ${trick.cards.length} cards`);
          trick.cards.forEach(card => {
            console.log(`      Card: ${card.suit} ${card.value} (Player: ${card.playerId}, Position: ${card.position})`);
          });
        });
      });
    }

    // If there are tricks, show details
    if (tricks > 0) {
      console.log('\n🃏 Trick Details:');
      console.log('=================');
      const trickDetails = await prisma.trick.findMany({
        include: {
          round: {
            include: {
              game: true
            }
          },
          cards: {
            orderBy: {
              position: 'asc'
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      trickDetails.forEach((trick, index) => {
        console.log(`\nTrick ${index + 1}:`);
        console.log(`  ID: ${trick.id}`);
        console.log(`  Round ID: ${trick.roundId}`);
        console.log(`  Trick Number: ${trick.trickNumber}`);
        console.log(`  Lead Player: ${trick.leadPlayerId}`);
        console.log(`  Winning Player: ${trick.winningPlayerId}`);
        console.log(`  Created: ${trick.createdAt}`);
        console.log(`  Cards: ${trick.cards.length}`);
        
        trick.cards.forEach(card => {
          console.log(`    ${card.position}: ${card.suit} ${card.value} (Player: ${card.playerId})`);
        });
      });
    }

    // Show recent activity
    console.log('\n📅 Recent Activity:');
    console.log('==================');
    
    const recentGames = await prisma.game.findMany({
      orderBy: {
        updatedAt: 'desc'
      },
      take: 5
    });
    
    if (recentGames.length > 0) {
      console.log('Recent Games:');
      recentGames.forEach(game => {
        console.log(`  ${game.updatedAt}: ${game.status} game (${game.gameMode})`);
      });
    } else {
      console.log('No recent games found');
    }

    console.log('\n✅ Detailed database analysis completed!');

  } catch (error) {
    console.error('❌ Error during database analysis:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the analysis
checkDetailedDatabase(); 