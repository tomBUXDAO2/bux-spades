const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  const usernameArg = process.argv.slice(2).join(' ');
  if (!usernameArg) {
    console.error('Usage: node scripts/printUserStats.js "Tom [BUX$DAO]"');
    process.exit(1);
  }

  try {
    const user = await prisma.user.findUnique({ where: { username: usernameArg } });
    if (!user) {
      console.log(`No user found for username: ${usernameArg}`);
      process.exit(0);
    }

    const gamePlayers = await prisma.gamePlayer.findMany({
      where: { userId: user.id },
      include: { Game: true }
    });

    const finished = gamePlayers.filter(gp => gp.Game && gp.Game.status === 'FINISHED');

    const totalGames = finished.length;
    const totalWins = finished.filter(gp => gp.won === true).length;
    const winRate = totalGames > 0 ? ((totalWins / totalGames) * 100) : 0;

    const totalBags = finished.reduce((sum, gp) => sum + (gp.finalBags || 0), 0);
    const bagsPerGame = totalGames > 0 ? (totalBags / totalGames) : 0;

    // Nil stats from GamePlayer flags
    const nilsBid = finished.filter(gp => gp.nilBid === true).length;
    const nilsMade = finished.filter(gp => gp.nilBid === true && gp.points && gp.points > 0).length; // heuristic
    const blindNilsBid = finished.filter(gp => gp.blindNilBid === true).length;
    const blindNilsMade = finished.filter(gp => gp.blindNilBid === true && gp.points && gp.points > 0).length; // heuristic

    // Mode breakdown
    const partners = finished.filter(gp => gp.Game.gameMode === 'PARTNERS');
    const solo = finished.filter(gp => gp.Game.gameMode === 'SOLO');
    const partnersWon = partners.filter(gp => gp.won).length;
    const soloWon = solo.filter(gp => gp.won).length;

    // Format breakdown (normalize MIRROR->MIRRORS)
    function isType(game, type) {
      const raw = game.bidType;
      if (type === 'MIRRORS') return raw === 'MIRROR';
      return raw === type;
    }
    const regPlayed = finished.filter(gp => isType(gp.Game, 'REGULAR')).length;
    const regWon = finished.filter(gp => isType(gp.Game, 'REGULAR') && gp.won).length;
    const whizPlayed = finished.filter(gp => isType(gp.Game, 'WHIZ')).length;
    const whizWon = finished.filter(gp => isType(gp.Game, 'WHIZ') && gp.won).length;
    const mirrorsPlayed = finished.filter(gp => isType(gp.Game, 'MIRRORS')).length;
    const mirrorsWon = finished.filter(gp => isType(gp.Game, 'MIRRORS') && gp.won).length;
    const gimmickPlayed = finished.filter(gp => isType(gp.Game, 'GIMMICK')).length;
    const gimmickWon = finished.filter(gp => isType(gp.Game, 'GIMMICK') && gp.won).length;

    // Special rules (prefer boolean flags if available)
    const screamerPlayed = finished.filter(gp => gp.Game.screamer === true).length;
    const screamerWon = finished.filter(gp => gp.Game.screamer === true && gp.won).length;
    const assassinPlayed = finished.filter(gp => gp.Game.assassin === true).length;
    const assassinWon = finished.filter(gp => gp.Game.assassin === true && gp.won).length;

    console.log('Tom [BUX$DAO]');
    console.log('Tom [BUX$DAO]');
    console.log(`⭐${isNaN(winRate) ? 'NaN' : winRate.toFixed(1)}% Win`);
    console.log(user.coins != null ? user.coins.toLocaleString() : '0');
    console.log(`🏁${totalGames} Played`);
    console.log(`🏆${totalWins} Won`);
    console.log(`🎒${totalBags} Bags`);
    console.log(`✅${bagsPerGame.toFixed(1)} Bags/G`);
    console.log('Nil Stats');
    console.log('Type\tBid\tMade\t%\tPoints');
    const nilPct = nilsBid > 0 ? Math.round((nilsMade / nilsBid) * 100) : 0;
    const blindNilPct = blindNilsBid > 0 ? Math.round((blindNilsMade / blindNilsBid) * 100) : 0;
    console.log(`Nil\t${nilsBid}\t${nilsMade}\t${nilPct}%\t+100`);
    console.log(`Blind Nil\t${blindNilsBid}\t${blindNilsMade}\t${blindNilPct}%\t0`);
    console.log('Game Mode Breakdown');
    console.log('(won/played)(win %)');
    function fmtLine(label, won, played) {
      const pct = played > 0 ? Math.round((won / played) * 100) : 0;
      console.log(`${label}\n${won}/${played}${pct}%`);
    }
    fmtLine('Regular', regWon, regPlayed);
    fmtLine('Whiz', whizWon, whizPlayed);
    fmtLine('Mirrors', mirrorsWon, mirrorsPlayed);
    fmtLine('Gimmick', gimmickWon, gimmickPlayed);
    console.log('Special Rules');
    console.log('(won/played)(win %)');
    fmtLine('Screamer', screamerWon, screamerPlayed);
    fmtLine('Assassin', assassinWon, assassinPlayed);

    await prisma.$disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})(); 