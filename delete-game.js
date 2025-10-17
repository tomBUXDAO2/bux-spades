const { PrismaClient } = require('@prisma/client');

async function deleteGame() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Deleting game game_1760558983869_q31fz1uhr...');
    
    // Get all related records first
    const rounds = await prisma.round.findMany({ 
      where: { gameId: 'game_1760558983869_q31fz1uhr' }, 
      select: { id: true } 
    });
    const roundIds = rounds.map(r => r.id);
    
    let trickIds = [];
    if (roundIds.length > 0) {
      const tricks = await prisma.trick.findMany({ 
        where: { roundId: { in: roundIds } }, 
        select: { id: true } 
      });
      trickIds = tricks.map(t => t.id);
    }
    
    // Delete in order
    if (trickIds.length > 0) {
      await prisma.trickCard.deleteMany({ where: { trickId: { in: trickIds } } });
      await prisma.trick.deleteMany({ where: { id: { in: trickIds } } });
    }
    
    if (roundIds.length > 0) {
      await prisma.$executeRaw`DELETE FROM "RoundHandSnapshot" WHERE "roundId" = ANY(${roundIds})`;
      await prisma.$executeRaw`DELETE FROM "PlayerRoundStats" WHERE "roundId" = ANY(${roundIds})`;
      await prisma.roundScore.deleteMany({ where: { roundId: { in: roundIds } } });
      await prisma.round.deleteMany({ where: { id: { in: roundIds } } });
    }
    
    await prisma.gamePlayer.deleteMany({ where: { gameId: 'game_1760558983869_q31fz1uhr' } });
    await prisma.gameResult.deleteMany({ where: { gameId: 'game_1760558983869_q31fz1uhr' } });
    await prisma.eventGame.deleteMany({ where: { gameId: 'game_1760558983869_q31fz1uhr' } });
    await prisma.game.delete({ where: { id: 'game_1760558983869_q31fz1uhr' } });
    
    console.log('✅ Game deleted successfully!');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

deleteGame();
