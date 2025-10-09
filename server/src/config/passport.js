import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import { prisma } from './database.js';

passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID || '',
  clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
  callbackURL: process.env.DISCORD_CALLBACK_URL || '',
  scope: ['identify', 'email']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    console.log('[DISCORD AUTH] Profile data:', {
      id: profile.id,
      username: profile.username,
      avatar: profile.avatar
    });

    // Fetch current Discord user data to get nickname and avatar
    const discordUserResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    
    let currentNickname = profile.username;
    let currentAvatar = profile.avatar;
    
    if (discordUserResponse.ok) {
      const discordUser = await discordUserResponse.json();
      console.log('[DISCORD AUTH] Discord API response:', {
        username: discordUser.username,
        global_name: discordUser.global_name,
        avatar: discordUser.avatar
      });
      
      // Use nickname if available, otherwise use username
      currentNickname = discordUser.global_name || discordUser.username;
      currentAvatar = discordUser.avatar;
    } else {
      console.log('[DISCORD AUTH] Failed to fetch Discord user data:', discordUserResponse.status);
    }

    const avatarUrl = currentAvatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${currentAvatar}.png` : '/default-pfp.jpg';
    console.log('[DISCORD AUTH] Final avatar URL:', avatarUrl);

    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { discordId: profile.id }
    });

    if (!user) {
      console.log('[DISCORD AUTH] Creating new user with avatar:', avatarUrl);
      
      // Create new user with 5 million starting coins
      user = await prisma.user.create({
        data: {
          discordId: profile.id,
          username: currentNickname,
          avatarUrl: avatarUrl,
          coins: 5000000, // Gift 5 million coins to new users
          createdAt: new Date()
        }
      });
      
      console.log('[DISCORD AUTH] New user created with 5M coins:', user.id);
    } else {
      console.log('[DISCORD AUTH] Existing user found:', user.id);
      
      // Update user data (username, avatar might have changed)
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          username: currentNickname,
          avatarUrl: avatarUrl
        }
      });
    }

    return done(null, user);
  } catch (error) {
    console.error('[DISCORD AUTH] Error:', error);
    return done(error, null);
  }
}));

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id }
    });
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;
