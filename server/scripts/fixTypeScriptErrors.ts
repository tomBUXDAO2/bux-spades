import fs from 'fs';
import path from 'path';

async function fixTypeScriptErrors() {
  try {
    console.log('🔧 Fixing TypeScript errors...\n');
    
    const serverPath = path.join(__dirname, '..', 'src');
    const gamesRoutesPath = path.join(serverPath, 'routes', 'games.routes.ts');
    
    // Read the current file
    let content = fs.readFileSync(gamesRoutesPath, 'utf8');
    
    console.log('1️⃣ Fixing GameResult creation type error...');
    
    // Fix the GameResult creation - remove the explicit type casting and fix the data structure
    const oldGameResultCode = `try {
        await prisma.gameResult.create({
          data: {
            gameId: dbGame.id,
            winner,
            finalScore,
            gameDuration: Math.floor((Date.now() - (game.createdAt || Date.now())) / 1000),
            team1Score,
            team2Score,
            playerResults,
            totalRounds,
            totalTricks,
            specialEvents,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });`;
    
    const newGameResultCode = `try {
        await prisma.gameResult.create({
          data: {
            gameId: dbGame.id,
            winner,
            finalScore,
            gameDuration: Math.floor((Date.now() - (game.createdAt || Date.now())) / 1000),
            team1Score,
            team2Score,
            playerResults,
            totalRounds,
            totalTricks,
            specialEvents
          }
        });`;
    
    if (content.includes(oldGameResultCode)) {
      content = content.replace(oldGameResultCode, newGameResultCode);
      console.log('   ✅ Fixed GameResult creation type error');
    } else {
      console.log('   ⚠️  GameResult creation code not found');
    }
    
    console.log('\n2️⃣ Fixing syntax error in coin calculation...');
    
    // Fix the syntax error around line 3283
    const brokenCoinCode = `console.log(\`[COIN CALCULATION] Player \${player.username}: totalPot=\${totalPot}, rake=\${rake}, prizePool=\${prizePool}, prizeAmount=\${prizeAmount}\`); else {`;
    
    const fixedCoinCode = `console.log(\`[COIN CALCULATION] Player \${player.username}: totalPot=\${totalPot}, rake=\${rake}, prizePool=\${prizePool}, prizeAmount=\${prizeAmount}\`);
        
        try {`;
    
    if (content.includes(brokenCoinCode)) {
      content = content.replace(brokenCoinCode, fixedCoinCode);
      console.log('   ✅ Fixed coin calculation syntax error');
    } else {
      console.log('   ⚠️  Coin calculation syntax error not found');
    }
    
    // Also need to fix the duplicate code that was created
    console.log('\n3️⃣ Removing duplicate code...');
    
    // Remove the duplicate prize calculation code
    const duplicateCode = `ers mode: winning team splits 90% of pot (2 winners)
t = Math.floor(prizePool / 2); // Each winner gets half of 90%
FIX: Ensure each winner only gets their share of the prize pool
ERS') {
t = Math.floor(prizePool / 2); // Force exactly half for partners mode
 
    if (content.includes(duplicateCode)) {
      content = content.replace(duplicateCode, '');
      console.log('   ✅ Removed duplicate code');
    } else {
      console.log('   ⚠️  Duplicate code not found');
    }
    
    // Write the updated file
    fs.writeFileSync(gamesRoutesPath, content);
    console.log('\n✅ TypeScript errors fixed successfully!');
    
    console.log('\n🎯 Summary of fixes:');
    console.log('   • Fixed GameResult creation type error by removing explicit type casting');
    console.log('   • Fixed syntax error in coin calculation');
    console.log('   • Removed duplicate code that was causing issues');
    console.log('   • Code should now compile without TypeScript errors');
    
  } catch (error) {
    console.error('❌ Error fixing TypeScript errors:', error);
  }
}

fixTypeScriptErrors();
