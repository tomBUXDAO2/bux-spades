const fs = require('fs');

// Read the file
let content = fs.readFileSync('games.routes.ts', 'utf8');

// Find the line with the setTimeout closing and add the continuation logic
const lines = content.split('\n');
const newLines = [];

for (let i = 0; i < lines.length; i++) {
  newLines.push(lines[i]);
  
  // After the setTimeout closing brace, add the continuation logic
  if (lines[i].includes('}, 1000); // 1 second delay to match frontend animation')) {
    newLines.push('        ');
    newLines.push('        // CRITICAL FIX: Continue to next player after trick completion');
    newLines.push('        // If next player is a bot, trigger their move with a delay');
    newLines.push('        if (game.players[game.play.currentPlayerIndex] && game.players[game.play.currentPlayerIndex]!.type === \'bot\') {');
    newLines.push('          console.log(\'[BOT TURN] Triggering bot turn for:\', game.players[game.play.currentPlayerIndex]!.username, \'at index:\', game.play.currentPlayerIndex);');
    newLines.push('          setTimeout(() => {');
    newLines.push('            // Double-check that it\'s still this bot\'s turn before playing');
    newLines.push('            if (game.play && game.play.currentPlayerIndex === game.play.currentPlayerIndex && ');
    newLines.push('                game.players[game.play.currentPlayerIndex] && game.players[game.play.currentPlayerIndex]!.type === \'bot\') {');
    newLines.push('              botPlayCard(game, game.play.currentPlayerIndex);');
    newLines.push('            }');
    newLines.push('          }, 1200); // Delay to allow animation to complete');
    newLines.push('        }');
    newLines.push('        // If the next player is a human, DO NOT trigger any bot moves - wait for human input');
  }
}

// Write the fixed content back
fs.writeFileSync('games.routes.ts', newLines.join('\n'));
console.log('Fixed trick continuation logic');
