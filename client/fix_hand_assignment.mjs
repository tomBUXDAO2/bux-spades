import fs from 'fs';

// Read the file
const filePath = 'src/table-ui/game/GameTable.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Find the problematic lines and fix them
const lines = content.split('\n');
const newLines = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  if (line.includes('const myPlayerIndex = gameState.players.findIndex(p => p && p.id === user?.id);')) {
    // Add currentPlayerId declaration before myPlayerIndex
    newLines.push('  const currentPlayerId = user?.id;');
    newLines.push(line);
  } else if (line.includes('// Find the current player\'s ID') && lines[i + 1] && lines[i + 1].includes('const currentPlayerId = user?.id;')) {
    // Skip the duplicate currentPlayerId declaration
    i++; // Skip the next line too
  } else {
    newLines.push(line);
  }
}

// Write the fixed content back
fs.writeFileSync(filePath, newLines.join('\n'));
console.log('Fixed hand assignment issue');
