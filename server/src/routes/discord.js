import express from 'express';
import {
  exchangeCodeForToken,
  getDiscordUser,
  checkFacebookConnection,
  checkAndAssignLeagueRole
} from '../discord/linkedRoles.js';

const router = express.Router();

const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const redirectUri = process.env.DISCORD_REDIRECT_URI || 'https://bux-spades-server.fly.dev/api/discord/callback';

// OAuth2 authorization URL
router.get('/linked-role-auth', (req, res) => {
  const authUrl = new URL('https://discord.com/api/oauth2/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'identify connections role_connections.write');
  authUrl.searchParams.set('prompt', 'none');

  res.redirect(authUrl.toString());
});

// OAuth2 callback
router.get('/callback', async (req, res) => {
  try {
    const { code, error } = req.query;

    if (error) {
      console.error('[DISCORD OAUTH] Authorization error:', error);
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authorization Failed</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: #23272a;
                color: #fff;
              }
              .container {
                text-align: center;
                padding: 40px;
                background: #2c2f33;
                border-radius: 8px;
                max-width: 500px;
              }
              h1 { color: #f04747; }
              p { margin: 20px 0; }
              a {
                display: inline-block;
                margin-top: 20px;
                padding: 10px 20px;
                background: #7289da;
                color: #fff;
                text-decoration: none;
                border-radius: 4px;
              }
              a:hover { background: #5b6eae; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>❌ Authorization Failed</h1>
              <p>There was an error authorizing your account. Please try again.</p>
              <p>Error: ${error}</p>
              <a href="/api/discord/linked-role-auth">Try Again</a>
            </div>
          </body>
        </html>
      `);
    }

    if (!code) {
      return res.status(400).send('Missing authorization code');
    }

    // Exchange code for access token
    const tokenData = await exchangeCodeForToken(code, redirectUri);
    const accessToken = tokenData.access_token;

    // Get user info
    const user = await getDiscordUser(accessToken);
    console.log(`[DISCORD OAUTH] User ${user.username} (${user.id}) is verifying Facebook connection`);

    // Check user's Facebook connection
    const hasFacebook = await checkFacebookConnection(user.id, accessToken);

    // Assign LEAGUE role if they have Facebook connected
    await checkAndAssignLeagueRole(guildId, user.id, hasFacebook);

    // Success page
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Verification ${hasFacebook ? 'Successful' : 'Failed'}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #23272a;
              color: #fff;
            }
            .container {
              text-align: center;
              padding: 40px;
              background: #2c2f33;
              border-radius: 8px;
              max-width: 500px;
            }
            h1 { color: ${hasFacebook ? '#43b581' : '#f04747'}; }
            p { margin: 20px 0; line-height: 1.6; }
            .status {
              font-size: 64px;
              margin-bottom: 20px;
            }
            .close {
              margin-top: 30px;
              padding: 10px 20px;
              background: #7289da;
              color: #fff;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 16px;
            }
            .close:hover { background: #5b6eae; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="status">${hasFacebook ? '✅' : '❌'}</div>
            <h1>${hasFacebook ? 'Verification Successful!' : 'Verification Failed'}</h1>
            ${hasFacebook ? `
              <p>You have successfully verified your Facebook connection!</p>
              <p>The <strong>LEAGUE</strong> role has been assigned to your account.</p>
              <p>You can now access League game rooms.</p>
            ` : `
              <p>You do not have Facebook connected with "Display on profile" enabled.</p>
              <p>To get the <strong>LEAGUE</strong> role:</p>
              <ol style="text-align: left; margin: 20px auto; max-width: 300px;">
                <li>Go to Discord Settings → Connections</li>
                <li>Connect your Facebook account</li>
                <li>Enable "Display on profile" for Facebook</li>
                <li>Click the verify button again</li>
              </ol>
            `}
            <button class="close" onclick="window.close()">Close this window</button>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('[DISCORD OAUTH] Error in callback:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Error</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #23272a;
              color: #fff;
            }
            .container {
              text-align: center;
              padding: 40px;
              background: #2c2f33;
              border-radius: 8px;
              max-width: 500px;
            }
            h1 { color: #f04747; }
            p { margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Error</h1>
            <p>An error occurred while processing your verification.</p>
            <p>Please try again later or contact support.</p>
          </div>
        </body>
      </html>
    `);
  }
});

export default router;
