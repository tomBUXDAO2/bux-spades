import { EmbedBuilder, ChannelType, TextChannel } from 'discord.js';
import { 
  GUILD_ID, 
  TEAM_CHANNEL_ID, 
  PUBLIC_BASE, 
  TEAM_OWNER_ID, 
  TEAM_DEV_ID, 
  TEAM_SUPPORT_ID, 
  TEAM_ADMIN_IDS,
} from '../constants';

/**
 * Post a one-time MEET THE TEAM embed if not already present
 */
export async function postMeetTheTeamEmbedOnce(client: any): Promise<void> {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = await guild.channels.fetch(TEAM_CHANNEL_ID);
    if (!channel || channel.type !== ChannelType.GuildText) {
      console.warn('[DISCORD BOT] Team channel not found or not a text channel');
      return;
    }
    const textChannel = channel as TextChannel;
    
    // Check recent messages for an existing embed with our title
    const messages = await textChannel.messages.fetch({ limit: 50 });
    const alreadyPosted = messages.some(m => 
      m.author.id === client.user?.id && 
      m.embeds?.some(e => (e.title || '').toUpperCase() === 'MEET THE TEAM')
    );
    
    if (alreadyPosted) {
      console.log('[DISCORD BOT] MEET THE TEAM embed already present; skipping post');
      return;
    }
    
    // First embed acts as header
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('MEET THE TEAM')
      .setThumbnail(`${PUBLIC_BASE}/bux-spades.png`)
      .addFields(
        { name: 'Server Owner', value: `<@${TEAM_OWNER_ID}> — [William Perryman Sr.](https://www.facebook.com/williamperrymansr)`, inline: false },
        { name: 'Game Developer', value: `<@${TEAM_DEV_ID}> — [Tom Garner](https://www.facebook.com/tomjgarner)`, inline: false },
        { name: 'Discord Support', value: `<@${TEAM_SUPPORT_ID}>`, inline: false },
        { name: 'Admins', value: `<@${TEAM_ADMIN_IDS[0]}> — [Nichole Foutz](https://www.facebook.com/nfoutz)  •  <@${TEAM_ADMIN_IDS[1]}> — [Dan Fedorka](https://www.facebook.com/ChosenWon666)`, inline: false }
      )
      .setTimestamp();
      
    await textChannel.send({ embeds: [embed] });
    console.log('[DISCORD BOT] Posted MEET THE TEAM embed');
  } catch (error) {
    console.error('[DISCORD BOT] Failed to post MEET THE TEAM embed:', error);
  }
}
