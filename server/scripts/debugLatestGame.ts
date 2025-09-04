import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugLatestGame() {
  try {
    console.log('Debugging latest completed game...');
    
    // Get the latest finished game
    const latestGame = await prisma.game.findFirst({
      where: { status: 'FINISHED' },
      orderBy: { createdAt: 'desc' }
    });
    
    if (!latestGame) {
      console.log('No finished games found');
      return;
    }
    
    console.log('Latest game:', latestGame.id, 'Status:', latestGame.status, 'Buy-in:', latestGame.buyIn);
    
    // Get all rounds and bids for this game
    const rounds = await prisma.round.findMany({
      where: { gameId: latestGame.id },
      include: { bids: true }
    });
    
    // Get all tricks for this game
    const tricks = await prisma.trick.findMany({
      where: { roundId: { in: rounds.map(r => r.id) } }
    });
    
    console.log(`Game has ${rounds.length} rounds and ${tricks.length} tricks`);
    
    // Calculate total tricks won by each player
    const playerTricks: { [playerId: string]: number } = {};
    const playerBids: { [playerId: string]: number } = {};
    
    // Initialize
    for (const round of rounds) {
      for (const bid of round.bids) {
        if (!playerBids[bid.playerId]) playerBids[bid.playerId] = 0;
        if (!playerTricks[bid.playerId]) playerTricks[bid.playerId] = 0;
        playerBids[bid.playerId] += bid.bid;
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
      const bags = Math.max(0, tricks - bids);
      console.log(`  Player ${playerId}: Bid ${bids}, Made ${tricks}, Bags ${bags}`);
    }
    
    // Check GamePlayer records
    const gamePlayers = await prisma.gamePlayer.findMany({
      where: { gameId: latestGame.id },
      include: { User: true }
    });
    
    console.log('\nGamePlayer records:');
    for (const gp of gamePlayers) {
      console.log(`  Position ${gp.position}: ${gp.User.username} - Bid: ${gp.bid}, Tricks: ${gp.tricksMade}, Bags: ${gp.finalBags}, Score: ${gp.finalScore}, Won: ${gp.won}`);
    }
    
    // Check UserStats
    console.log('\nUserStats:');
    for (const [playerId, tricks] of Object.entries(playerTricks)) {
      const stats = await prisma.userStats.findUnique({
        where: { userId: playerId }
      });
      
      if (stats) {
        console.log(`  ${playerId}: Games: ${stats.gamesPlayed}, Won: ${stats.gamesWon}, Bags: ${stats.totalBags}, TricksBid: ${stats.totalTricksBid}, TricksMade: ${stats.totalTricksMade}`);
      }
    }
    
  } catch (error) {
    console.error('Error debugging game:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugLatestGame(); 