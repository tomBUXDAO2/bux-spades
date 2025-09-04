import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixLatestGame() {
  try {
    console.log('Fixing latest completed game...');
    
    // Get the latest game
    const latestGame = await prisma.game.findFirst({
      where: { finished: true },
      orderBy: { createdAt: 'desc' },
      include: { players: true }
    });
    
    if (!latestGame) {
      console.log('No finished games found');
      return;
    }
    
    console.log('Latest game:', latestGame.id, 'Mode:', latestGame.gameMode, 'Buy-in:', latestGame.buyIn);
    
    // Get all rounds and bids for this game
    const rounds = await prisma.round.findMany({
      where: { gameId: latestGame.id },
      include: { bids: true }
    });
    
    // Get all tricks for this game
    const tricks = await prisma.trick.findMany({
      where: { roundId: { in: rounds.map(r => r.id) } },
      include: { round: true }
    });
    
    // Calculate total tricks won by each player
    const playerTricks: { [playerId: string]: number } = {};
    const playerBids: { [playerId: string]: number } = {};
    const playerNilBids: { [playerId: string]: number } = {};
    
    // Initialize
    for (const round of rounds) {
      for (const bid of round.bids) {
        if (!playerBids[bid.playerId]) playerBids[bid.playerId] = 0;
        if (!playerNilBids[bid.playerId]) playerNilBids[bid.playerId] = 0;
        if (!playerTricks[bid.playerId]) playerTricks[bid.playerId] = 0;
        
        playerBids[bid.playerId] += bid.bid;
        if (bid.bid === 0) playerNilBids[bid.playerId]++;
      }
    }
    
    // Count tricks won
    for (const trick of tricks) {
      if (!playerTricks[trick.winningPlayerId]) playerTricks[trick.winningPlayerId] = 0;
      playerTricks[trick.winningPlayerId]++;
    }
    
    console.log('Player stats:');
    for (const [playerId, tricks] of Object.entries(playerTricks)) {
      const bids = playerBids[playerId] || 0;
      const nilBids = playerNilBids[playerId] || 0;
      const bags = Math.max(0, tricks - bids);
      console.log(`  Player ${playerId}: Bid ${bids}, Made ${tricks}, Bags ${bags}, Nil bids ${nilBids}`);
    }
    
    // Calculate team scores
    let team1Score = 0;
    let team2Score = 0;
    
    for (const [playerId, tricks] of Object.entries(playerTricks)) {
      const bids = playerBids[playerId] || 0;
      const bags = Math.max(0, tricks - bids);
      let roundScore = 0;
      
      if (bids === 0) {
        // Nil bid
        roundScore = tricks === 0 ? 100 : -100;
      } else {
        // Regular bid
        if (tricks >= bids) {
          roundScore = bids * 10 + bags;
        } else {
          roundScore = -bids * 10;
        }
      }
      
      // Determine team (positions 0,2 = team 1, positions 1,3 = team 2)
      const gamePlayer = await prisma.gamePlayer.findFirst({
        where: { gameId: latestGame.id, userId: playerId }
      });
      
      if (gamePlayer) {
        if (gamePlayer.position === 0 || gamePlayer.position === 2) {
          team1Score += roundScore;
        } else {
          team2Score += roundScore;
        }
        
        // Update GamePlayer record
        await prisma.gamePlayer.update({
          where: { id: gamePlayer.id },
          data: {
            bid: bids,
            tricksMade: tricks,
            finalBags: bags,
            finalScore: roundScore,
            finalPoints: roundScore,
            won: (gamePlayer.position === 0 || gamePlayer.position === 2) ? 
                 (team1Score > team2Score) : (team2Score > team1Score)
          }
        });
        
        console.log(`  Updated GamePlayer for position ${gamePlayer.position}: bid=${bids}, tricks=${tricks}, bags=${bags}, score=${roundScore}`);
      }
    }
    
    console.log(`Final team scores: Team 1: ${team1Score}, Team 2: ${team2Score}`);
    
    // Update UserStats for each player
    for (const [playerId, tricks] of Object.entries(playerTricks)) {
      const bids = playerBids[playerId] || 0;
      const nilBids = playerNilBids[playerId] || 0;
      const bags = Math.max(0, tricks - bids);
      
      // Get current stats
      const currentStats = await prisma.userStats.findUnique({
        where: { userId: playerId }
      });
      
      // Determine if player won
      const gamePlayer = await prisma.gamePlayer.findFirst({
        where: { gameId: latestGame.id, userId: playerId }
      });
      const isWinner = gamePlayer?.won || false;
      
      // Update UserStats
      const updatedStats = await prisma.userStats.update({
        where: { userId: playerId },
        data: {
          gamesPlayed: { increment: 1 },
          gamesWon: { increment: isWinner ? 1 : 0 },
          partnersGamesPlayed: { increment: latestGame.gameMode === 'PARTNERS' ? 1 : 0 },
          partnersGamesWon: { increment: latestGame.gameMode === 'PARTNERS' && isWinner ? 1 : 0 },
          soloGamesPlayed: { increment: latestGame.gameMode === 'SOLO' ? 1 : 0 },
          soloGamesWon: { increment: latestGame.gameMode === 'SOLO' && isWinner ? 1 : 0 },
          totalTricksBid: { increment: bids },
          totalTricksMade: { increment: tricks },
          totalNilBids: { increment: nilBids },
          totalBags: { increment: bags },
          bagsPerGame: { set: ((currentStats?.totalBags || 0) + bags) / ((currentStats?.gamesPlayed || 0) + 1) }
        }
      });
      
      console.log(`  Updated UserStats for ${playerId}: games=${updatedStats.gamesPlayed}, won=${updatedStats.gamesWon}, bags=${updatedStats.totalBags}`);
    }
    
    // Handle coin distribution
    const buyIn = latestGame.buyIn || 0;
    if (buyIn > 0) {
      const totalPot = buyIn * 4;
      const rake = Math.floor(totalPot * 0.1); // 10% rake
      const prizePool = totalPot - rake;
      
      if (latestGame.gameMode === 'PARTNERS') {
        // Partners mode: winning team splits prize pool
        const prizePerWinner = Math.floor(prizePool / 2);
        
        for (const [playerId, tricks] of Object.entries(playerTricks)) {
          const gamePlayer = await prisma.gamePlayer.findFirst({
            where: { gameId: latestGame.id, userId: playerId }
          });
          
          if (gamePlayer?.won) {
            // Winner gets prize
            await prisma.user.update({
              where: { id: playerId },
              data: { coins: { increment: prizePerWinner } }
            });
            
            await prisma.userStats.update({
              where: { userId: playerId },
              data: {
                totalCoinsWon: { increment: prizePerWinner },
                netCoins: { increment: prizePerWinner }
              }
            });
            
            console.log(`  Winner ${playerId} received ${prizePerWinner} coins`);
          } else {
            // Loser already paid buy-in, update stats
            await prisma.userStats.update({
              where: { userId: playerId },
              data: {
                totalCoinsLost: { increment: buyIn },
                netCoins: { decrement: buyIn }
              }
            });
            
            console.log(`  Loser ${playerId} lost ${buyIn} coins (buy-in)`);
          }
        }
      }
    }
    
    console.log('Game fix completed successfully!');
    
  } catch (error) {
    console.error('Error fixing game:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixLatestGame(); 