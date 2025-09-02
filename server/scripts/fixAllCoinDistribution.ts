import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixAllCoinDistribution() {
  try {
    console.log('💰 Fixing coin distribution for all finished games...');
    
    // Get all finished games
    const finishedGames = await prisma.game.findMany({
      where: { status: 'FINISHED' },
      orderBy: { createdAt: 'desc' },
      include: {
        GamePlayer: {
          include: { User: true }
        }
      }
    });
    
    console.log(`🎮 Found ${finishedGames.length} finished games`);
    
    for (const game of finishedGames) {
      console.log(`\n🎮 Processing game: ${game.id}`);
      console.log(`📊 Buy-in: ${game.buyIn} coins, Mode: ${game.gameMode}, Rated: ${game.rated}`);
      
      const buyIn = game.buyIn || 0;
      if (buyIn === 0) {
        console.log('  ⚠️  No buy-in found, skipping...');
        continue;
      }
      
      // Check if this game already has coin tracking
      const hasCoinTracking = game.GamePlayer.some(gp => {
        return gp.User?.UserStats && (
          (gp.User.UserStats.totalCoinsWon || 0) > 0 ||
          (gp.User.UserStats.totalCoinsLost || 0) > 0
        );
      });
      
      if (hasCoinTracking) {
        console.log('  ✅ Game already has coin tracking, skipping...');
        continue;
      }
      
      console.log('  🔧 Game needs coin distribution fix...');
      
      // Calculate prize distribution
      const totalPot = buyIn * 4;
      const rake = Math.floor(totalPot * 0.1); // 10% rake
      const prizePool = totalPot - rake;
      
      console.log(`  💰 Total pot: ${totalPot} coins`);
      console.log(`  🏠 House rake: ${rake} coins (10%)`);
      console.log(`  🏆 Prize pool: ${prizePool} coins`);
      
      // Determine winners and losers
      const winners = game.GamePlayer.filter(gp => gp.won === true);
      const losers = game.GamePlayer.filter(gp => gp.won === false);
      
      console.log(`  🏆 Winners (${winners.length}): ${winners.map(gp => gp.User.username).join(', ')}`);
      console.log(`  💔 Losers (${losers.length}): ${losers.map(gp => gp.User.username).join(', ')}`);
      
      // Calculate prize per winner
      let prizePerWinner = 0;
      if (game.gameMode === 'SOLO') {
        // Solo mode: 2nd place gets buy-in back, 1st place gets remainder
        const secondPlacePrize = buyIn;
        prizePerWinner = prizePool - secondPlacePrize; // 1st place gets remainder
        console.log(`  🎯 Solo mode: 1st place gets ${prizePerWinner} coins, 2nd place gets ${secondPlacePrize} coins`);
      } else {
        // Partners mode: winning team splits 90% of pot (2 winners)
        prizePerWinner = Math.floor(prizePool / 2); // Each winner gets half of 90%
        console.log(`  🤝 Partners mode: Each winner gets ${prizePerWinner} coins`);
      }
      
      // Distribute prizes to winners
      console.log('  💰 Distributing prizes to winners...');
      for (const winner of winners) {
        try {
          // Update user's coin balance
          await prisma.user.update({
            where: { id: winner.userId },
            data: { coins: { increment: prizePerWinner } }
          });
          
          // Update UserStats coin tracking
          await prisma.userStats.update({
            where: { userId: winner.userId },
            data: {
              totalCoinsWon: { increment: prizePerWinner },
              totalCoinsLost: { increment: 0 },
              netCoins: { increment: prizePerWinner - buyIn }, // Prize minus buy-in
              updatedAt: new Date()
            }
          });
          
          console.log(`    ✅ ${winner.User.username}: +${prizePerWinner} coins (net: +${prizePerWinner - buyIn})`);
        } catch (err) {
          console.error(`    ❌ Failed to update ${winner.User.username}:`, err);
        }
      }
      
      // Update losers' coin tracking
      console.log('  💸 Updating losers\' coin tracking...');
      for (const loser of losers) {
        try {
          // Update UserStats coin tracking (losers already had buy-in deducted at game start)
          await prisma.userStats.update({
            where: { userId: loser.userId },
            data: {
              totalCoinsWon: { increment: 0 },
              totalCoinsLost: { increment: buyIn },
              netCoins: { decrement: buyIn },
              updatedAt: new Date()
            }
          });
          
          console.log(`    ✅ ${loser.User.username}: -${buyIn} coins (buy-in lost)`);
        } catch (err) {
          console.error(`    ❌ Failed to update ${loser.User.username}:`, err);
        }
      }
      
      console.log('  ✅ Game coin distribution fixed!');
    }
    
    console.log('\n🔍 Final verification of coin distribution...');
    
    // Show summary of all players' coin status
    const allPlayers = await prisma.user.findMany({
      where: {
        UserStats: {
          isNot: null
        }
      },
      include: {
        UserStats: true
      },
      orderBy: {
        username: 'asc'
      }
    });
    
    console.log('\n📊 Player Coin Summary:');
    console.log('Username | Current Coins | Total Won | Total Lost | Net');
    console.log('---------|---------------|-----------|------------|------');
    
    for (const player of allPlayers) {
      const stats = player.UserStats;
      const currentCoins = player.coins;
      const totalWon = stats?.totalCoinsWon || 0;
      const totalLost = stats?.totalCoinsLost || 0;
      const net = stats?.netCoins || 0;
      
      console.log(`${player.username.padEnd(9)} | ${currentCoins.toString().padStart(13)} | ${totalWon.toString().padStart(10)} | ${totalLost.toString().padStart(11)} | ${net.toString().padStart(3)}`);
    }
    
    console.log('\n✅ All coin distribution fixes completed!');
    
  } catch (error) {
    console.error('❌ Error fixing coin distribution:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
fixAllCoinDistribution(); 