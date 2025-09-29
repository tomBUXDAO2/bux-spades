import { GuildMember, EmbedBuilder } from 'discord.js';
import { prisma } from '../../lib/prisma';

/**
 * Handle welcome message for new Discord members
 */
export async function handleWelcomeMessage(member: GuildMember): Promise<void> {
  try {
    console.log(`[WELCOME] Processing welcome for new member: ${member.user.username} (${member.id})`);
    
    // Check if user already exists in database
    const existingUser = await prisma.user.findFirst({
      where: { discordId: member.id }
    });
    
    if (existingUser) {
      console.log(`[WELCOME] User ${member.user.username} already exists in database, skipping welcome`);
      return;
    }
    
    // Create new user with 5 million coins
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    
    const newUser = await prisma.user.create({
      data: {
        id: userId,
        username: member.user.username,
        discordId: member.id,
        coins: 5000000, // 5 million coins
        avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 128 }),
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
    
    console.log(`[WELCOME] Created new user ${member.user.username} with 5M coins: ${newUser.id}`);
    
    // Send welcome message
    const welcomeChannelId = process.env.DISCORD_WELCOME_CHANNEL_ID || '1403837418494492763'; // Default to general channel
    const welcomeChannel = member.guild.channels.cache.get(welcomeChannelId);
    
    if (welcomeChannel && welcomeChannel.isTextBased()) {
      const welcomeEmbed = new EmbedBuilder()
        .setColor(0x00ff00) // Green color
        .setTitle('🎉 Welcome to BUX Spades!')
        .setDescription(`Welcome ${member.user} to the BUX Spades community!`)
        .addFields(
          {
            name: '💰 Starting Coins',
            value: '5,000,000 coins have been added to your account!',
            inline: true
          },
          {
            name: '🎮 Get Started',
            value: 'Visit [bux-spades.pro](https://bux-spades.pro) to start playing!',
            inline: true
          },
          {
            name: '📱 Connect Your Account',
            value: 'Link your Discord account in the app to access all features!',
            inline: false
          }
        )
        .setThumbnail(member.user.displayAvatarURL({ extension: 'png', size: 128 }))
        .setFooter({ text: 'Welcome to the BUX Spades community!' })
        .setTimestamp();
      
      await welcomeChannel.send({ embeds: [welcomeEmbed] });
      console.log(`[WELCOME] Sent welcome message for ${member.user.username}`);
    } else {
      console.warn(`[WELCOME] Welcome channel not found or not accessible for ${member.user.username}`);
    }
    
  } catch (error) {
    console.error(`[WELCOME] Error processing welcome for ${member.user.username}:`, error);
  }
}
