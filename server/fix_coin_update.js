const fs = require('fs');

// Read the file
let content = fs.readFileSync('src/routes/games.routes.ts', 'utf8');

// Replace the problematic coin update logic
const oldCode = `s with explicit error handling
st result = await prisma.user.update({ 
}, 
s: { increment: prizeAmount } } 
sole.log(\`[COIN SUCCESS] Awarded \${prizeAmount} coins to winner \${player.username} (\${userId}). New balance: \${result.coins}\`);`;

const newCode = `s with explicit error handling - use direct update instead of increment
st currentUser = await prisma.user.findUnique({ where: { id: userId } });
tUser) {
sole.error(\`[COIN ERROR] User \${userId} not found\`);
tinue;
st newBalance = currentUser.coins + prizeAmount;
st result = await prisma.user.update({ 
}, 
s: newBalance } 
sole.log(\`[COIN SUCCESS] Awarded \${prizeAmount} coins to winner \${player.username} (\${userId}). Old balance: \${currentUser.coins}, New balance: \${result.coins}\`);`;

content = content.replace(oldCode, newCode);

// Write the file back
fs.writeFileSync('src/routes/games.routes.ts', content);

console.log('Fixed coin update logic');
