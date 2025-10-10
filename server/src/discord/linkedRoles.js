import { REST, Routes } from 'discord.js';
import { client } from './bot.js';

const clientId = process.env.DISCORD_CLIENT_ID;
const clientSecret = process.env.DISCORD_CLIENT_SECRET;
const token = process.env.DISCORD_BOT_TOKEN;
const leagueRoleId = '1403953667501195284';

// Register role metadata with Discord (simplified for manual verification)
export async function registerRoleMetadata() {
  try {
    // Skip metadata registration since Linked Roles is not available
    console.log('[FACEBOOK VERIFY] Using manual verification system');
  } catch (error) {
    console.error('[FACEBOOK VERIFY] Error:', error);
  }
}

// Get user's connections from Discord
export async function getUserConnections(accessToken) {
  try {
    const response = await fetch('https://discord.com/api/v10/users/@me/connections', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch connections: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[LINKED ROLES] Error fetching user connections:', error);
    return [];
  }
}

// Check user's Facebook connection (simplified for manual verification)
export async function checkFacebookConnection(userId, accessToken) {
  try {
    // Get user's connections
    const connections = await getUserConnections(accessToken);
    
    // Check if user has Facebook connected with "show on profile" enabled
    const facebookConnection = connections.find(
      conn => conn.type === 'facebook' && conn.visibility === 1
    );

    const hasFacebookConnected = !!facebookConnection;

    console.log(`[FACEBOOK VERIFY] User ${userId} - Facebook connected: ${hasFacebookConnected}`);
    
    if (facebookConnection) {
      console.log(`[FACEBOOK VERIFY] Facebook name: ${facebookConnection.name}`);
    }

    return hasFacebookConnected;
  } catch (error) {
    console.error('[FACEBOOK VERIFY] Error checking Facebook connection:', error);
    throw error;
  }
}

// Assign LEAGUE role to user if they have Facebook connected
export async function checkAndAssignLeagueRole(guildId, userId, hasFacebook) {
  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    
    if (hasFacebook && !member.roles.cache.has(leagueRoleId)) {
      await member.roles.add(leagueRoleId);
      console.log(`[LINKED ROLES] ✅ Assigned LEAGUE role to user ${userId}`);
      return true;
    } else if (!hasFacebook && member.roles.cache.has(leagueRoleId)) {
      await member.roles.remove(leagueRoleId);
      console.log(`[LINKED ROLES] ❌ Removed LEAGUE role from user ${userId}`);
      return false;
    }

    return hasFacebook;
  } catch (error) {
    console.error('[LINKED ROLES] Error assigning role:', error);
    throw error;
  }
}

// Exchange authorization code for access token
export async function exchangeCodeForToken(code, redirectUri) {
  try {
    const response = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Token exchange failed: ${JSON.stringify(error)}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[LINKED ROLES] Error exchanging code for token:', error);
    throw error;
  }
}

// Get user info from Discord
export async function getDiscordUser(accessToken) {
  try {
    const response = await fetch('https://discord.com/api/v10/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[LINKED ROLES] Error fetching Discord user:', error);
    throw error;
  }
}

