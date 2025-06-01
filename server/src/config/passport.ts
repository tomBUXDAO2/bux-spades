import { Strategy as DiscordStrategy } from 'passport-discord';
import { PrismaClient } from '@prisma/client';
import passport from 'passport';

const prisma = new PrismaClient();

passport.use(
  new DiscordStrategy(
    {
      clientID: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      callbackURL: process.env.DISCORD_CALLBACK_URL,
      scope: ['identify', 'email'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('Discord OAuth callback received:', { 
          profileId: profile.id,
          username: profile.username,
          email: profile.email
        });

        // Check if user exists
        let user = await prisma.user.findUnique({
          where: { discordId: profile.id },
          select: {
            id: true,
            username: true,
            email: true,
            discordId: true,
            avatar: true,
            coins: true,
            createdAt: true,
            updatedAt: true
          }
        });

        if (user) {
          console.log('Existing user found:', user.id);
          return done(null, user);
        }

        // Create new user
        user = await prisma.user.create({
          data: {
            username: profile.username,
            discordId: profile.id,
            email: profile.email,
            password: "", // Default empty password for Discord users
            avatar: profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : null,
          },
          select: {
            id: true,
            username: true,
            email: true,
            discordId: true,
            avatar: true,
            coins: true,
            createdAt: true,
            updatedAt: true
          }
        });

        console.log('New user created:', user.id);

        // Create user stats
        await prisma.userStats.create({
          data: {
            userId: user.id,
          },
        });

        return done(null, user);
      } catch (error) {
        console.error('Error in Discord OAuth callback:', error);
        return done(error as Error);
      }
    }
  )
);

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        discordId: true,
        avatar: true,
        coins: true,
        createdAt: true,
        updatedAt: true
      }
    });
    done(null, user);
  } catch (error) {
    console.error('Error deserializing user:', error);
    done(error);
  }
}); 