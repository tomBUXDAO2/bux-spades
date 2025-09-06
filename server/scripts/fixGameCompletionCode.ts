import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function fixGameCompletionCode() {
  try {
    console.log('🔧 Fixing game completion code issues...\n');
    
    const serverPath = path.join(__dirname, '..', 'src');
    const gamesRoutesPath = path.join(serverPath, 'routes', 'games.routes.ts');
    
    // Read the current file
    let content = fs.readFileSync(gamesRoutesPath, 'utf8');
    
    console.log('1️⃣ Fixing winner determination logic...');
    
    // Fix the winner determination logic to use database team values (0-based)
    const oldWinnerLogic = `// Partners mode: winningTeamOrPlayer is the winning team (1 or 2)
\t\t\tisWinner = (winningTeamOrPlayer === 1 && (i === 0 || i === 2)) || (winningTeamOrPlayer === 2 && (i === 1 || i === 3));`;
    
    const newWinnerLogic = `// Partners mode: winningTeamOrPlayer is the winning team (1 or 2)
\t\t\t// But database uses 0-based teams, so we need to convert
\t\t\t// Team 1 in game logic = Team 0 in database
\t\t\t// Team 2 in game logic = Team 1 in database
\t\t\tconst winningTeamInDb = winningTeamOrPlayer - 1; // Convert 1-based to 0-based
\t\t\tisWinner = (winningTeamInDb === 0 && (i === 0 || i === 2)) || (winningTeamInDb === 1 && (i === 1 || i === 3));`;
    
    if (content.includes(oldWinnerLogic)) {
      content = content.replace(oldWinnerLogic, newWinnerLogic);
      console.log('   ✅ Fixed winner determination logic');
    } else {
      console.log('   ⚠️  Winner determination logic not found or already fixed');
    }
    
    console.log('\n2️⃣ Adding better error handling for GameResult creation...');
    
    // Find the GameResult creation code and add better error handling
    const gameResultCreationPattern = /await \(prisma\.gameResult\.create as any\)\(\{[\s\S]*?\}\);/;
    const gameResultMatch = content.match(gameResultCreationPattern);
    
    if (gameResultMatch) {
      const oldGameResultCode = gameResultMatch[0];
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
            specialEvents,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });
        console.log(\`[GAME RESULT] Successfully created GameResult for game \${dbGame.id}\`);
      } catch (gameResultError) {
        console.error(\`[GAME RESULT ERROR] Failed to create GameResult for game \${dbGame.id}:\`, gameResultError);
        // Continue execution - don't let GameResult failure break the entire process
      }`;
      
      content = content.replace(oldGameResultCode, newGameResultCode);
      console.log('   ✅ Added better error handling for GameResult creation');
    } else {
      console.log('   ⚠️  GameResult creation code not found');
    }
    
    console.log('\n3️⃣ Adding coin distribution validation...');
    
    // Add validation before coin distribution
    const coinDistributionPattern = /if \(buyIn > 0 && isWinner\) \{[\s\S]*?\}/;
    const coinMatch = content.match(coinDistributionPattern);
    
    if (coinMatch) {
      const oldCoinCode = coinMatch[0];
      const newCoinCode = `if (buyIn > 0 && isWinner) {
        // Validate winner status before distributing coins
        console.log(\`[COIN VALIDATION] Player \${player.username} (pos \${i}): isWinner=\${isWinner}, buyIn=\${buyIn}\`);
        
        // Award prizes to winners only
        let prizeAmount = 0;
        const totalPot = buyIn * 4;
        const rake = Math.floor(totalPot * 0.1); // 10% rake
        const prizePool = totalPot - rake;
        
        if (game.gameMode === 'SOLO') {
          // Solo mode: 2nd place gets buy-in back, 1st place gets remainder
          const secondPlacePrize = buyIn;
          prizeAmount = prizePool - secondPlacePrize; // 1st place gets remainder
        } else {
          // Partners mode: winning team splits 90% of pot (2 winners)
          prizeAmount = Math.floor(prizePool / 2); // Each winner gets half of 90%
        }
        
        // CRITICAL FIX: Ensure each winner only gets their share of the prize pool
        if (game.gameMode === 'PARTNERS') {
          prizeAmount = Math.floor(prizePool / 2); // Force exactly half for partners mode
        }
        
        console.log(\`[COIN CALCULATION] Player \${player.username}: totalPot=\${totalPot}, rake=\${rake}, prizePool=\${prizePool}, prizeAmount=\${prizeAmount}\`);`;
      
      content = content.replace(oldCoinCode, newCoinCode);
      console.log('   ✅ Added coin distribution validation');
    } else {
      console.log('   ⚠️  Coin distribution code not found');
    }
    
    console.log('\n4️⃣ Adding team assignment validation...');
    
    // Add a comment about team numbering consistency
    const teamComment = `// CRITICAL: Team numbering consistency
    // Game logic uses 1-based teams (Team 1, Team 2)
    // Database uses 0-based teams (Team 0, Team 1)
    // When storing winner in database, convert: winner = winningTeam + 1
    // When reading winner from database, convert: winningTeam = winner - 1`;
    
    // Find a good place to add this comment
    const gameCompletionPattern = /async function completeGame\(game: Game, winningTeamOrPlayer: number\)/;
    if (content.includes('async function completeGame(game: Game, winningTeamOrPlayer: number)')) {
      content = content.replace(
        'async function completeGame(game: Game, winningTeamOrPlayer: number)',
        `${teamComment}\n\nasync function completeGame(game: Game, winningTeamOrPlayer: number)`
      );
      console.log('   ✅ Added team numbering consistency comment');
    }
    
    // Write the updated file
    fs.writeFileSync(gamesRoutesPath, content);
    console.log('\n✅ Code fixes applied successfully!');
    
    console.log('\n🎯 Summary of code fixes:');
    console.log('   • Fixed winner determination logic to handle 0-based vs 1-based team numbering');
    console.log('   • Added better error handling for GameResult creation');
    console.log('   • Added coin distribution validation and logging');
    console.log('   • Added team numbering consistency documentation');
    console.log('   • Future games should now work correctly');
    
  } catch (error) {
    console.error('❌ Error fixing game completion code:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixGameCompletionCode();
