import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixRecentGameStats() {
  try {
    console.log('🔧 Fixing recent game statistics...');
    
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
    console.log(`📊 Game mode: ${recentGame.gameMode}, Bid type: ${recentGame.bidType}`);
    console.log(`🏆 Rated: ${recentGame.rated}, League: ${recentGame.league}`);
    
    // Get all rounds for this game
    const rounds = await prisma.round.findMany({
      where: { gameId: recentGame.id },
      include: { bids: true }
    });
    
    console.log(`📚 Found ${rounds.length} rounds`);
    
    // Calculate final scores for each player
    for (const gamePlayer of recentGame.GamePlayer) {
      console.log(`\n👤 Processing player: ${gamePlayer.User.username} (position ${gamePlayer.position})`);
      
      // Sum all bids for this player across all rounds
      let totalBid = 0;
      for (const round of rounds) {
        const roundBid = round.bids.find(rb => rb.playerId === gamePlayer.userId);
        if (roundBid) {
          totalBid += roundBid.bid;
          console.log(`  Round ${round.roundNumber}: bid ${roundBid.bid}`);
        }
      }
      
      console.log(`  Total bid: ${totalBid}`);
      
      // Calculate total tricks won for this player
      let totalTricksWon = 0;
      for (const round of rounds) {
        const tricks = await prisma.trick.findMany({
          where: { roundId: round.id }
        });
        
        for (const trick of tricks) {
          if (trick.winningPlayerId === gamePlayer.userId) {
            totalTricksWon++;
          }
        }
      }
      
      console.log(`  Total tricks won: ${totalTricksWon}`);
      
      // Calculate final score and points
      let finalScore = 0;
      let finalPoints = 0;
      let finalBags = Math.max(0, totalTricksWon - totalBid);
      
      if (totalBid === 0) {
        // Nil bid: 100 points if made, -100 if failed
        finalScore = totalTricksWon === 0 ? 100 : -100;
        finalPoints = finalScore;
        console.log(`  Nil bid result: ${finalScore > 0 ? 'MADE' : 'FAILED'} (${finalScore} points)`);
      } else {
        // Regular bid: 10 points per trick bid if made, -10 points per trick bid if failed
        if (totalTricksWon >= totalBid) {
          finalScore = totalBid * 10 + finalBags; // Bid points + bags
          finalPoints = totalBid * 10;
          console.log(`  Bid result: MADE (${finalPoints} points) + ${finalBags} bags = ${finalScore} total`);
        } else {
          finalScore = -totalBid * 10; // Failed bid penalty
          finalPoints = finalScore;
          console.log(`  Bid result: FAILED (${finalScore} points)`);
        }
      }
      
      // Update GamePlayer record
      await prisma.gamePlayer.update({
        where: { id: gamePlayer.id },
        data: {
          bid: totalBid,
          tricksMade: totalTricksWon,
          finalBags: finalBags,
          finalScore: finalScore,
          finalPoints: finalPoints,
          updatedAt: new Date()
        }
      });
      
      console.log(`  ✅ Updated: bid=${totalBid}, tricks=${totalTricksWon}, bags=${finalBags}, score=${finalScore}, points=${finalPoints}`);
      
      // Update UserStats if this is a human player
      if (gamePlayer.User) {
        console.log(`  📊 Updating UserStats for ${gamePlayer.User.username}...`);
        
        // Calculate bags for this player
        const playerBags = Math.max(0, totalTricksWon - totalBid);
        
        // Get current stats
        const currentStats = await prisma.userStats.findUnique({
          where: { userId: gamePlayer.userId }
        });
        
        // Update or create UserStats
        await prisma.userStats.upsert({
          where: { userId: gamePlayer.userId },
          create: {
            id: `stats_${gamePlayer.userId}`,
            userId: gamePlayer.userId,
            gamesPlayed: 1,
            gamesWon: 0, // Will be calculated based on team results
            totalTricksBid: totalBid,
            totalTricksMade: totalTricksWon,
            totalNilBids: totalBid === 0 ? 1 : 0,
            totalBlindNilBids: 0,
            totalBags: playerBags,
            bagsPerGame: playerBags,
            updatedAt: new Date()
          },
          update: {
            totalTricksBid: { increment: totalBid },
            totalTricksMade: { increment: totalTricksWon },
            totalNilBids: { increment: totalBid === 0 ? 1 : 0 },
            totalBags: { increment: playerBags },
            bagsPerGame: { set: currentStats ? (currentStats.totalBags + playerBags) / (currentStats.gamesPlayed + 1) : playerBags },
            updatedAt: new Date()
          }
        });
        
        console.log(`  ✅ UserStats updated for ${gamePlayer.User.username}`);
      }
    }
    
    // Calculate team scores and determine winner
    console.log('\n🏆 Calculating team scores...');
    
    const team1Score = recentGame.GamePlayer
      .filter(gp => gp.position === 0 || gp.position === 2)
      .reduce((sum, gp) => sum + (gp.finalScore || 0), 0);
    
    const team2Score = recentGame.GamePlayer
      .filter(gp => gp.position === 1 || gp.position === 3)
      .reduce((sum, gp) => sum + (gp.finalScore || 0), 0);
    
    console.log(`  Team 1 (positions 0,2): ${team1Score} points`);
    console.log(`  Team 2 (positions 1,3): ${team2Score} points`);
    
    const winningTeam = team1Score > team2Score ? 1 : 2;
    console.log(`  🏆 Winning team: ${winningTeam}`);
    
    // Update GamePlayer won status
    for (const gamePlayer of recentGame.GamePlayer) {
      const isWinner = (winningTeam === 1 && (gamePlayer.position === 0 || gamePlayer.position === 2)) ||
                      (winningTeam === 2 && (gamePlayer.position === 1 || gamePlayer.position === 3));
      
      await prisma.gamePlayer.update({
        where: { id: gamePlayer.id },
        data: { won: isWinner }
      });
      
      console.log(`  ${gamePlayer.User.username} (position ${gamePlayer.position}): ${isWinner ? 'WINNER' : 'LOSER'}`);
      
      // Update UserStats gamesWon if this is a human player
      if (gamePlayer.User) {
        await prisma.userStats.update({
          where: { userId: gamePlayer.userId },
          data: {
            gamesWon: { increment: isWinner ? 1 : 0 },
            updatedAt: new Date()
          }
        });
      }
    }
    
    console.log('\n✅ Game statistics fixed successfully!');
    
  } catch (error) {
    console.error('❌ Error fixing game statistics:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
fixRecentGameStats(); 