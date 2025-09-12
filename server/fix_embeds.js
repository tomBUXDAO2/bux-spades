const fs = require('fs');
let content = fs.readFileSync('src/discord-bot/bot.ts', 'utf8');

// Replace game creation embed
content = content.replace(/\.setDescription\(`\*\*\\\$\{gameLineTitle\}\*\*\\\$\{specialRulesText\}`\)/g, 
  '.setDescription(`<@&1403953667501195284>\n\n**${gameLineTitle}**${specialRulesText}`)');

// Replace table up embed  
content = content.replace(/\.setDescription\(`\*\*\\\$\{gameLineFormat\}\*\*\\\\n\\\\n\\\$\{teamInfo\}\\\\n\\\\n\*\*Please open your BUX Spades app, login with your Discord profile and you will be directed to your table...\*\*\\\\n\\\\n\*\*GOOD LUCK! 🍀\*\*`\)/g,
  '.setDescription(`<@&1403953667501195284>\n\n**${gameLineFormat}**\n\n${teamInfo}\n\n**Please open your BUX Spades app, login with your Discord profile and you will be directed to your table...**\n\n**GOOD LUCK! 🍀**`)');

// Replace game results embed
content = content.replace(/\.setDescription\(`\*\*\\\$\{gameLine\}\*\*`\)/g,
  '.setDescription(`<@&1403953667501195284>\n\n**${gameLine}**`)');

fs.writeFileSync('src/discord-bot/bot.ts', content);
console.log('Fixed all embeds!');
