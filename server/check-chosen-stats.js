import { prisma } from './src/config/database.js';

async function main() {
  try {
    // Find ChosenWon
    const user = await prisma.user.findFirst({
      where: { username: { contains: 'Chosen', mode: 'insensitive' } }
    });

    if (!user) {
      console.log('User not found');
      return;
    }

    console.log('USER ID:', user.id);
    console.log('USERNAME:', user.username);
    console.log('\n--- LEAGUE GAMES ---\n');

    // Get all league games he played in
    const leagueGames = await prisma.game.findMany({
      where: {
        isLeague: true,
        status: 'FINISHED',
        players: { some: { userId: user.id } }
      },
      include: {
        players: {
          select: { userId: true, seatIndex: true }
        },
        result: true
      },
      orderBy: { finishedAt: 'desc' }
    });

    console.log(`Total league games: ${leagueGames.length}\n`);

    let wins = 0;
    for (const game of leagueGames) {
      const userPlayer = game.players.find(p => p.userId === user.id);
      if (!userPlayer) continue;

      const userSeat = userPlayer.seatIndex;
      const userTeam = (userSeat % 2 === 0) ? 'TEAM_0' : 'TEAM_1';
      const isWinner = game.result?.winner === userTeam;

      if (isWinner) wins++;

      console.log(`Game: ${game.id}`);
      console.log(`  Mode: ${game.mode}`);
      console.log(`  User seat: ${userSeat} (team: ${userTeam})`);
      console.log(`  Winner: ${game.result?.winner || 'NO RESULT'}`);
      console.log(`  Is winner: ${isWinner}`);
      console.log(`  Finished: ${game.finishedAt}`);
      console.log('');
    }

    console.log(`\nCALCULATED: ${leagueGames.length} played, ${wins} won`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
