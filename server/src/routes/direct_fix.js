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
    newLines.push('        // CRITICAL FIX: Continue to next player after trick completion');
    newLines.push('        // If the next player is a bot, trigger their move with a delay');
    newLines.push('        const nextPlayer = game.players[winnerIndex];');
    newLines.push('        if (nextPlayer && nextPlayer.type === \'bot\') {');
    newLines.push('          console.log(\'[BOT TRICK CONTINUATION] Triggering bot\', nextPlayer.username, \'at position\', winnerIndex, \'to play after delay\');');
    newLines.push('          setTimeout(() => {');
    newLines.push('            botPlayCard(game, winnerIndex);');
    newLines.push('          }, 1200); // Delay to allow animation to complete');
    newLines.push('        } else {');
    newLines.push('          console.log(\'[BOT TRICK CONTINUATION] Next player is human\', nextPlayer?.username, \'at position\', winnerIndex, \'- waiting for human input\');');
    newLines.push('          // Start timeout for human players in playing phase');
    newLines.push('          const { startTurnTimeout } = require(\'../index\');');
    newLines.push('          startTurnTimeout(game, winnerIndex, \'playing\');');
    newLines.push('        }');
    newLines.push('      } else {');
    newLines.push('        // Trick is not complete, advance to next player');
    newLines.push('        let nextPlayerIndex = (seatIndex + 1) % 4;');
    newLines.push('        game.play.currentPlayerIndex = nextPlayerIndex;');
    newLines.push('        game.play.currentPlayer = game.players[nextPlayerIndex]?.id ?? \'\';');
    newLines.push('        ');
    newLines.push('        // Emit play_update to notify frontend about the card being played');
    newLines.push('        io.to(game.id).emit(\'play_update\', {');
    newLines.push('          currentPlayerIndex: nextPlayerIndex,');
    newLines.push('          currentTrick: game.play.currentTrick,');
    newLines.push('          hands: game.hands.map((h, i) => ({');
    newLines.push('            playerId: game.players[i]?.id,');
    newLines.push('            handCount: h.length,');
    newLines.push('          })),');
    newLines.push('        });');
    newLines.push('        ');
    newLines.push('        // Emit game update to ensure frontend has latest state');
    newLines.push('        io.to(game.id).emit(\'game_update\', enrichGameForClient(game));');
    newLines.push('        ');
    newLines.push('        // If the next player is a bot, trigger their move with a delay');
    newLines.push('        const nextPlayer = game.players[nextPlayerIndex];');
    newLines.push('        if (nextPlayer && nextPlayer.type === \'bot\') {');
    newLines.push('          console.log(\'[BOT TURN DEBUG] Triggering bot\', nextPlayer.username, \'at position\', nextPlayerIndex, \'to play after delay\');');
    newLines.push('          setTimeout(() => {');
    newLines.push('            botPlayCard(game, nextPlayerIndex);');
    newLines.push('          }, 800); // Reduced delay for faster bot play');
    newLines.push('        } else {');
    newLines.push('          console.log(\'[BOT TURN DEBUG] Next player is human\', nextPlayer?.username, \'at position\', nextPlayerIndex, \'- waiting for human input\');');
    newLines.push('          // Start timeout for human players in playing phase using the main timeout system');
    newLines.push('          console.log(\'[TIMEOUT DEBUG] Starting timeout for human player in playing phase:\', nextPlayer?.username);');
    newLines.push('          // Import the timeout function from index.ts');
    newLines.push('          const { startTurnTimeout } = require(\'../index\');');
    newLines.push('          startTurnTimeout(game, nextPlayerIndex, \'playing\');');
    newLines.push('        }');
    newLines.push('      }');
  }
}

// Write the fixed content back
fs.writeFileSync('games.routes.ts', newLines.join('\n'));
console.log('Fixed trick continuation logic');
