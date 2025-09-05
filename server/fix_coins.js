const fs = require('fs');

// Read the file
let content = fs.readFileSync('src/routes/games.routes.ts', 'utf8');

// Find and replace the problematic coin update section
const searchPattern = /const result = await prisma\.user\.update\(\{[\s\S]*?data: \{ coins: \{ increment: prizeAmount \} \}[\s\S]*?\}\);/;

const replacement = `const currentUser = await prisma.user.findUnique({ where: { id: userId } });
tUser) {
sole.error(\`[COIN ERROR] User \${userId} not found\`);
tinue;
st newBalance = currentUser.coins + prizeAmount;
st result = await prisma.user.update({ 

s: newBalance } 
tent = content.replace(searchPattern, replacement);

// Write the file back
fs.writeFileSync('src/routes/games.routes.ts', content);

console.log('Fixed coin update logic');
