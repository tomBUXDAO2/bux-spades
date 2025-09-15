import { Events, GuildMember } from 'discord.js';
import prisma from '../../lib/prisma';
import { 
  hasFacebookConnected, 
  awardLeagueRole, 
  removeLeagueRole,
  postVerificationEmbed 
} from '../verification';
import { GUILD_ID } from '../constants';

/**
 * Handle bot ready event
 */
export function handleClientReady(client: any): void {
  client.once(Events.ClientReady, () => {
    console.log(`Discord bot logged in as ${client.user?.tag}`);
    console.log(`Monitoring guild: ${GUILD_ID}`);
    
    // Debug: List all guilds the bot can see
    console.log('Available guilds:');
    client.guilds.cache.forEach((guild: any, id: string) => {
      console.log(`- ${guild.name} (${id})`);
    });
    
    // Check if our target guild is accessible
    const targetGuild = client.guilds.cache.get(GUILD_ID);
    if (targetGuild) {
      console.log(`✅ Target guild found: ${targetGuild.name}`);
    } else {
      console.log(`❌ Target guild NOT found! Available guilds: ${Array.from(client.guilds.cache.keys()).join(', ')}`);
    }
    
    // Verification embed is now posted manually when needed
    // postVerificationEmbed(client);
  });
}

/**
 * Handle new member join event
 */
export function handleGuildMemberAdd(client: any): void {
  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    console.log(`New member joined: ${member.user.username} (${member.id})`);
    
    // Check if they have Facebook connected and award role if so
    const hasFacebook = await hasFacebookConnected(member.id);
    if (hasFacebook) {
      await awardLeagueRole(member);
    }
  });
}

/**
 * Handle member update event
 */
export function handleGuildMemberUpdate(client: any): void {
  client.on(Events.GuildMemberUpdate, async (oldMember: GuildMember, newMember: GuildMember) => {
    // Check if Facebook connection status changed
    const oldHasFacebook = await hasFacebookConnected(oldMember.id);
    const newHasFacebook = await hasFacebookConnected(newMember.id);
    
    if (oldHasFacebook !== newHasFacebook) {
      console.log(`Facebook connection status changed for ${newMember.user.username}: ${oldHasFacebook} -> ${newHasFacebook}`);
      
      if (newHasFacebook) {
        await awardLeagueRole(newMember);
      } else {
        // Only remove role if user is definitely not verified (not just temporarily unavailable)
        const userInDatabase = await prisma.user.findFirst({
          where: { discordId: newMember.id }
        });
        
        if (!userInDatabase) {
          await removeLeagueRole(newMember);
        } else {
          console.log(`Keeping LEAGUE role for ${newMember.user.username} - user exists in database (was verified)`);
        }
      }
    }
  });
}
