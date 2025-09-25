import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';

passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  callbackURL: process.env.DISCORD_CALLBACK_URL!,
  scope: ['identify', 'email']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Fetch current Discord user data to get nickname and avatar
    const discordUserResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    
    let currentNickname = profile.username;
    let currentAvatar = profile.avatarUrl;
    
    if (discordUserResponse.ok) {
      const discordUser = await discordUserResponse.json() as any;
      // Use nickname if available, otherwise use username
      currentNickname = discordUser.global_name || discordUser.username;
      currentAvatar = discordUser.avatarUrl;
    }

    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { discordId: profile.id }
    });

    if (!user) {
      // Create new user
      const now = new Date();
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      user = await prisma.user.create({
        data: {
          id: userId,
          username: currentNickname,
          discordId: profile.id,
          // email: profile.email || null,
          // password: '',
          avatarUrl: currentAvatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${currentAvatar}.png` : '/default-pfp.jpg',
          createdAt: now,
          updatedAt: now
        } as any
      });

      // Create user stats
      const statsId = `stats_${userId}_${Date.now()}`;
      await prisma.userStats.create({
        data: {
          id: statsId,
          userId: userId,
          createdAt: now,
          updatedAt: now
        } as any
      });
    } else {
      // Update existing user with current Discord data
      const now = new Date();
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          username: currentNickname,
          avatarUrl: currentAvatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${currentAvatar}.png` : user.avatarUrl,
          updatedAt: now
        } as any
      });
    }

    return done(null, user);
  } catch (error) {
    console.error('Discord strategy error:', error);
    return done(error as Error);
  }
}));

passport.use(new LocalStrategy(async (username, password, done) => {
  try {
    const user = await prisma.user.findFirst({
      where: { username },
      
    });

    if (!user || !user.UserStats) {
      return done(null, false, { message: 'Invalid credentials' });
    }

    const stats = user.UserStats as any;
    
    if (!user.password || !(await bcrypt.compare(password, user.password))) {
      return done(null, false, { message: 'Invalid credentials' });
    }

    return done(null, user);
  } catch (error) {
    return done(error as Error);
  }
}));

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      
    });
    done(null, user);
  } catch (error) {
    done(error as Error);
  }
});

export default passport; 