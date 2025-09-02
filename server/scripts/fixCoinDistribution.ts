import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixCoinDistribution() {
  try {
    console.log('💰 Fixing coin distribution for recent game...');
    
    // Get the most recent finished game
    const recentGame = await prisma.game.findFirst({
      where: { status: 'FINISHED' },
      orderBy: { createdAt: 'desc' },
      include: {
        GamePlayer: {
          include: { User: true }
        }
      }
    });
    
    if (!recentGame) {
      console.log('❌ No finished games found');
      return;
    }
    
    console.log(`🎮 Found game: ${recentGame.id}`);
    console.log(`📊 Buy-in: ${recentGame.buyIn} coins`);
    console.log(`🏆 Rated: ${recentGame.rated}, League: ${recentGame.league}`);
    
    const buyIn = recentGame.buyIn || 0;
    if (buyIn === 0) {
      console.log('❌ No buy-in found for this game');
      return;
    }
    
    // Calculate prize distribution
    const totalPot = buyIn * 4;
    const rake = Math.floor(totalPot * 0.1); // 10% rake
    const prizePool = totalPot - rake;
    
    console.log(`💰 Total pot: ${totalPot} coins`);
    console.log(`🏠 House rake: ${rake} coins (10%)`);
    console.log(`🏆 Prize pool: ${prizePool} coins`);
    
    // Determine winners and losers
    const winners = recentGame.GamePlayer.filter(gp => gp.won === true);
    const losers = recentGame.GamePlayer.filter(gp => gp.won === false);
    
    console.log(`\n🏆 Winners (${winners.length}):`);
    winners.forEach(gp => console.log(`  ${gp.User.username} (position ${gp.position})`));
    
    console.log(`\n💔 Losers (${losers.length}):`);
    losers.forEach(gp => console.log(`  ${gp.User.username} (position ${gp.position})`));
    
    // Calculate prize per winner
    let prizePerWinner = 0;
    if (recentGame.gameMode === 'SOLO') {
      // Solo mode: 2nd place gets buy-in back, 1st place gets remainder
      const secondPlacePrize = buyIn;
      prizePerWinner = prizePool - secondPlacePrize; // 1st place gets remainder
      console.log(`\n🎯 Solo mode: 1st place gets ${prizePerWinner} coins, 2nd place gets ${secondPlacePrize} coins`);
    } else {
      // Partners mode: winning team splits 90% of pot (2 winners)
      prizePerWinner = Math.floor(prizePool / 2); // Each winner gets half of 90%
      console.log(`\n🤝 Partners mode: Each winner gets ${prizePerWinner} coins`);
    }
    
    // Distribute prizes to winners
    console.log('\n💰 Distributing prizes to winners...');
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
        
        console.log(`  ✅ ${winner.User.username}: +${prizePerWinner} coins (net: +${prizePerWinner - buyIn})`);
      } catch (err) {
        console.error(`  ❌ Failed to update ${winner.User.username}:`, err);
      }
    }
    
    // Update losers' coin tracking
    console.log('\n💸 Updating losers\' coin tracking...');
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
        
        console.log(`  ✅ ${loser.User.username}: -${buyIn} coins (buy-in lost)`);
      } catch (err) {
        console.error(`  ❌ Failed to update ${loser.User.username}:`, err);
      }
    }
    
    // Verify the results
    console.log('\n🔍 Verifying coin distribution...');
    for (const player of recentGame.GamePlayer) {
      const user = await prisma.user.findUnique({
        where: { id: player.userId },
        include: { UserStats: true }
      });
      
      if (user && user.UserStats) {
        const isWinner = player.won === true;
        const expectedNet = isWinner ? (prizePerWinner - buyIn) : -buyIn;
        console.log(`  ${user.username}: ${isWinner ? 'WINNER' : 'LOSER'}, Net: ${expectedNet} coins, Stats: ${user.UserStats.netCoins || 0}`);
      }
    }
    
    console.log('\n✅ Coin distribution fixed successfully!');
    
  } catch (error) {
    console.error('❌ Error fixing coin distribution:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
fixCoinDistribution(); 