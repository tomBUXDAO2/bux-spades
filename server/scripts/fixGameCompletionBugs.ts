import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixGameCompletionBugs() {
  try {
    console.log('🔧 Fixing game completion bugs...\n');
    
    const gameId = '1ed3d69e-29c8-47dd-9ae3-de8983bd3d92';
    
    // Step 1: Fix the winner in the Game table (should be 1, not 2)
    console.log('1️⃣ Fixing winner in Game table...');
    await prisma.game.update({
      where: { id: gameId },
      data: { winner: 1 } // Team 1 won (Tom and MFSassy)
    });
    console.log('   ✅ Updated winner from 2 to 1');
    
    // Step 2: Create the missing GameResult record
    console.log('\n2️⃣ Creating missing GameResult record...');
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: { GamePlayer: { include: { User: true } } }
    });
    
    if (game) {
      // Calculate expected values
      const totalPot = game.buyIn * 4; // 1.6M
      const rake = Math.floor(totalPot * 0.1); // 160k
      const prizePool = totalPot - rake; // 1.44M
      const winnerPrize = Math.floor(prizePool / 2); // 720k per winner
      
      const playerResults = {
        players: game.GamePlayer.map((gp, i) => ({
          position: gp.position,
          userId: gp.userId,
          username: gp.username,
          team: gp.team,
          finalBid: gp.bid || 0,
          finalTricks: gp.tricksMade || 0,
          finalBags: gp.finalBags || 0,
          finalScore: gp.finalScore || 0,
          won: gp.won
        }))
      };
      
      const now = new Date();
      await prisma.gameResult.create({
        data: {
          id: `result_${gameId}_${Date.now()}`,
          gameId: gameId,
          winner: 1, // Team 1 won
          finalScore: 372, // Winning team score
          gameDuration: Math.floor((Date.now() - game.createdAt.getTime()) / 1000),
          team1Score: 372, // Team 1 (Tom + MFSassy)
          team2Score: 193, // Team 0 (Nichole + GEM)
          playerResults: playerResults,
          totalRounds: 3, // 3 hands played
          totalTricks: 39, // 13 tricks per hand
          specialEvents: { nils: {}, totalHands: 3 },
          createdAt: now,
          updatedAt: now
        }
      });
      console.log('   ✅ Created GameResult record');
    }
    
    // Step 3: Fix MFSassy's coins (should be 10,320,000, not 9,600,000)
    console.log('\n3️⃣ Fixing MFSassy\'s coins...');
    const mfsassyUser = await prisma.user.findFirst({
      where: { username: 'MFSassy' }
    });
    
    if (mfsassyUser) {
      const correctBalance = 10320000; // 10M + 320k
      await prisma.user.update({
        where: { id: mfsassyUser.id },
        data: { coins: correctBalance }
      });
      console.log(`   ✅ Updated MFSassy's coins from ${mfsassyUser.coins.toLocaleString()} to ${correctBalance.toLocaleString()}`);
    }
    
    // Step 4: Fix user stats for all players
    console.log('\n4️⃣ Fixing user stats...');
    const gamePlayers = await prisma.gamePlayer.findMany({
      where: { gameId: gameId },
      include: { User: true }
    });
    
    for (const gp of gamePlayers) {
      const isWinner = gp.won;
      const bags = gp.finalBags || 0;
      
      // Update or create UserStats
      try {
        await prisma.userStats.update({
          where: { userId: gp.userId },
          data: {
            gamesPlayed: { increment: 1 },
            gamesWon: { increment: isWinner ? 1 : 0 },
            totalBags: { increment: bags },
            totalCoinsWon: { increment: isWinner ? 720000 : 0 },
            totalCoinsLost: { increment: isWinner ? 0 : 400000 },
            netCoins: { increment: isWinner ? 320000 : -400000 }
          }
        });
        console.log(`   ✅ Updated stats for ${gp.User.username}: +1 game, ${isWinner ? '+1 win' : '+0 wins'}, +${bags} bags`);
      } catch (error) {
        // Create new UserStats if doesn't exist
        await prisma.userStats.create({
          data: {
            id: gp.userId,
            userId: gp.userId,
            gamesPlayed: 1,
            gamesWon: isWinner ? 1 : 0,
            totalBags: bags,
            totalCoinsWon: isWinner ? 720000 : 0,
            totalCoinsLost: isWinner ? 0 : 400000,
            netCoins: isWinner ? 320000 : -400000
          }
        });
        console.log(`   ✅ Created stats for ${gp.User.username}: 1 game, ${isWinner ? '1 win' : '0 wins'}, ${bags} bags`);
      }
    }
    
    // Step 5: Verify the fixes
    console.log('\n5️⃣ Verifying fixes...');
    
    // Check Game winner
    const updatedGame = await prisma.game.findUnique({
      where: { id: gameId },
      select: { winner: true }
    });
    console.log(`   Game winner: ${updatedGame?.winner} (should be 1)`);
    
    // Check GameResult
    const gameResult = await prisma.gameResult.findFirst({
      where: { gameId: gameId }
    });
    console.log(`   GameResult exists: ${gameResult ? 'Yes' : 'No'}`);
    
    // Check MFSassy's coins
    const mfsassyUpdated = await prisma.user.findFirst({
      where: { username: 'MFSassy' },
      select: { coins: true }
    });
    console.log(`   MFSassy's coins: ${mfsassyUpdated?.coins.toLocaleString()} (should be 10,320,000)`);
    
    // Check user stats
    const allStats = await prisma.userStats.findMany({
      where: { 
        userId: { in: gamePlayers.map(gp => gp.userId) }
      },
      include: { User: true }
    });
    
    console.log('\n📊 Final User Stats:');
    for (const stats of allStats) {
      console.log(`   ${stats.User.username}: ${stats.gamesPlayed} games, ${stats.gamesWon} wins, ${stats.totalBags} bags, ${stats.netCoins?.toLocaleString()} net coins`);
    }
    
    console.log('\n✅ All game completion bugs fixed!');
    console.log('\n🎯 Summary of fixes:');
    console.log('   • Fixed winner from 2 to 1 in Game table');
    console.log('   • Created missing GameResult record');
    console.log('   • Fixed MFSassy\'s coins (+320k instead of -400k)');
    console.log('   • Updated all user stats correctly');
    console.log('   • Game is now ready for Discord embed (if league game)');
    
  } catch (error) {
    console.error('❌ Error fixing game completion bugs:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixGameCompletionBugs();
