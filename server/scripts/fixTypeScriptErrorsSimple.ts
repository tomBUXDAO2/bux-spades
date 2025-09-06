import fs from 'fs';
import path from 'path';

async function fixTypeScriptErrorsSimple() {
  try {
    console.log('🔧 Fixing TypeScript errors (simple approach)...\n');
    
    const serverPath = path.join(__dirname, '..', 'src');
    const gamesRoutesPath = path.join(serverPath, 'routes', 'games.routes.ts');
    
    // Read the current file
    let content = fs.readFileSync(gamesRoutesPath, 'utf8');
    
    console.log('1️⃣ Fixing GameResult creation type error...');
    
    // Fix 1: Remove the explicit createdAt and updatedAt fields that are causing type errors
    content = content.replace(
      /createdAt: new Date\(\),\s*updatedAt: new Date\(\)/g,
      ''
    );
    
    console.log('   ✅ Removed explicit createdAt/updatedAt fields');
    
    console.log('\n2️⃣ Fixing syntax error in coin calculation...');
    
    // Fix 2: Fix the malformed line with "; else {"
    content = content.replace(
      /console\.log\(`\[COIN CALCULATION\].*?`\);\s*else\s*{/g,
      (match) => match.replace('; else {', ';')
    );
    
    console.log('   ✅ Fixed coin calculation syntax error');
    
    // Write the updated file
    fs.writeFileSync(gamesRoutesPath, content);
    console.log('\n✅ TypeScript errors fixed successfully!');
    
  } catch (error) {
    console.error('❌ Error fixing TypeScript errors:', error);
  }
}

fixTypeScriptErrorsSimple();
