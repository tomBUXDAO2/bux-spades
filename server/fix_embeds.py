import re

# Read the file
with open('src/discord-bot/bot.ts', 'r') as f:
    content = f.read()

# Replace the embeds
content = re.sub(
    r'\.setDescription\(`\*\*\$/{gameLineTitle}\*\*\$/{specialRulesText}`\)',
    r'.setDescription(`<@&1403953667501195284>\n\n**${gameLineTitle}**${specialRulesText}`)',
    content
)

content = re.sub(
    r'\.setDescription\(`\*\*\$/{gameLineFormat}\*\*\\n\\n\$/{teamInfo}\\n\\n\*\*Please open your BUX Spades app, login with your Discord profile and you will be directed to your table\.\.\.\*\*\\n\\n\*\*GOOD LUCK! 🍀\*\*`\)',
    r'.setDescription(`<@&1403953667501195284>\n\n**${gameLineFormat}**\n\n${teamInfo}\n\n**Please open your BUX Spades app, login with your Discord profile and you will be directed to your table...**\n\n**GOOD LUCK! 🍀**`)',
    content
)

content = re.sub(
    r'\.setDescription\(`\*\*\$/{gameLine}\*\*`\)',
    r'.setDescription(`<@&1403953667501195284>\n\n**${gameLine}**`)',
    content
)

# Write the file back
with open('src/discord-bot/bot.ts', 'w') as f:
    f.write(content)

print("Fixed embeds!")
