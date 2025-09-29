# Discord Bot Setup Guide

This bot automatically awards a "LEAGUE" role to Discord users who have connected their Facebook account to their Discord profile.

## Prerequisites

1. **Discord Application & Bot**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application
   - Go to "Bot" section and create a bot
   - Copy the bot token

2. **Bot Permissions**
   - In the "Bot" section, enable these permissions:
     - Manage Roles
     - Read Messages/View Channels
     - Send Messages
     - Use Slash Commands
   - In "OAuth2" > "URL Generator", select:
     - `bot` scope
     - `applications.commands` scope
     - All the permissions listed above

3. **Invite Bot to Your Server**
   - Use the generated OAuth2 URL to invite the bot to your Discord server
   - Make sure the bot has permission to manage roles

## Environment Variables

Add these to your `.env` file:

```env
# Discord Bot Configuration
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_application_client_id
DISCORD_GUILD_ID=your_server_guild_id
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Register bot commands:
```bash
npx ts-node src/discord-bot/commands.ts
```

3. Start the server:
```bash
npm run dev
```

## How It Works

### Automatic Role Assignment
- When users join your Discord server, the bot checks if they have Facebook connected
- If they do, they automatically get the "LEAGUE" role
- If they disconnect Facebook, the role is removed

### Manual Commands
- `/checkfacebook` - Admin command to check all members and update roles

### Integration with Your Game
- When users authenticate with Discord in your game, it automatically checks their Facebook connection
- The bot will award/remove the LEAGUE role based on their Facebook connection status

## Testing

1. **Test Facebook Connection Check:**
   - Connect your Facebook account to Discord
   - Join your Discord server
   - The bot should automatically award you the LEAGUE role

2. **Test Manual Command:**
   - Use `/checkfacebook` in your Discord server
   - The bot will check all members and report results

3. **Test Game Integration:**
   - Login to your game with Discord
   - The bot should check your Facebook connection and update your role

## Troubleshooting

### Bot Not Responding
- Check if the bot token is correct
- Ensure the bot has proper permissions
- Verify the bot is online in your server

### Role Not Being Awarded
- Check bot permissions (needs "Manage Roles")
- Ensure the bot role is higher in hierarchy than the LEAGUE role
- Check server logs for error messages

### Facebook Connection Not Detected
- Users must have their Facebook account connected to Discord
- The connection must be visible to the bot
- Some privacy settings may prevent the bot from seeing connections

## Security Notes

- The bot only checks Facebook connections, it doesn't access any Facebook data
- Users can disconnect Facebook at any time, which will remove the LEAGUE role
- The bot respects Discord's privacy settings and rate limits 