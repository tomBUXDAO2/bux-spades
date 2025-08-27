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
          username: profile.username,
          discordId: profile.id,
          email: profile.email || null,
          password: '',
          avatar: profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : '/default-pfp.jpg',
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
    }

    return done(null, user);
  } catch (error) {
    return done(error as Error);
  }
}));

passport.use(new LocalStrategy(async (username, password, done) => {
  try {
    const user = await prisma.user.findFirst({
      where: { username },
      include: { UserStats: true }
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
      include: { UserStats: true }
    });
    done(null, user);
  } catch (error) {
    done(error as Error);
  }
});

export default passport; 