import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import { prisma } from '../lib/prisma';

passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  callbackURL: process.env.DISCORD_CALLBACK_URL!,
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
      const discordUser = await discordUserResponse.json() as any;
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
      // Create new user - only include fields that exist in the schema
      user = await prisma.user.create({
        data: {
          username: currentNickname,
          discordId: profile.id,
          avatarUrl: avatarUrl
        }
      });

      // Create user stats
      await prisma.userStats.create({
        data: {
          userId: user.id
        }
      });
    } else {
      console.log('[DISCORD AUTH] Updating existing user with avatar:', avatarUrl);
      // Update existing user with current Discord data
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          username: currentNickname,
          avatarUrl: avatarUrl
        }
      });
    }

    console.log('[DISCORD AUTH] User created/updated successfully:', {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl
    });

    return done(null, user);
  } catch (error) {
    console.error('Discord strategy error:', error);
    return done(error as Error);
  }
}));

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
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
