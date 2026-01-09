import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { TournamentService } from './TournamentService.js';

const TOURNAMENT_CHANNEL_ID = '1403843239362170900';

export class DiscordTournamentService {
  /**
   * Post tournament registration embed to Discord
   * @param {Object} client - Discord client instance
   * @param {Object} tournament - Tournament database record
   * @returns {Promise<Object>} - { messageId, channelId }
   */
  static async postTournamentEmbed(client, tournament) {
    try {
      const channel = await client.channels.fetch(TOURNAMENT_CHANNEL_ID);
      if (!channel) {
        throw new Error(`Tournament channel ${TOURNAMENT_CHANNEL_ID} not found`);
      }

      const embed = this.buildTournamentEmbed(tournament);
      const components = this.buildTournamentButtons(tournament.id);

      const message = await channel.send({
        embeds: [embed],
        components: [components],
      });

      // Update tournament with Discord message info
      await TournamentService.updateTournament(tournament.id, {
        discordMessageId: message.id,
        discordChannelId: message.channel.id,
      });

      return {
        messageId: message.id,
        channelId: message.channel.id,
      };
    } catch (error) {
      console.error('[DISCORD TOURNAMENT] Error posting embed:', error);
      throw error;
    }
  }

  /**
   * Build tournament registration embed
   */
  static buildTournamentEmbed(tournament) {
    const startTimestamp = Math.floor(new Date(tournament.startTime).getTime() / 1000);
    
    // Format buy-in
    const buyInStr = tournament.buyIn 
      ? tournament.buyIn >= 1000000 
        ? `${tournament.buyIn / 1000000}M` 
        : `${tournament.buyIn / 1000}k`
      : 'Free';

    // Format prizes
    let prizesText = '';
    if (tournament.prizes) {
      const prizes = typeof tournament.prizes === 'string' 
        ? JSON.parse(tournament.prizes) 
        : tournament.prizes;
      
      if (prizes.winners) {
        prizesText += `\n**🏆 Winners:** ${prizes.winners}`;
      }
      if (prizes.runnersUp) {
        prizesText += `\n**🥈 Runners-up:** ${prizes.runnersUp}`;
      }
    }

    // Build description
    let description = `**📅 Starts:** <t:${startTimestamp}:F>\n`;
    description += `**🎮 Mode:** ${tournament.mode}\n`;
    description += `**💰 Buy-in:** ${buyInStr} coins\n`;
    description += `**📊 Points:** ${tournament.minPoints || -100} to ${tournament.maxPoints || 500}\n`;
    description += `**🎯 Format:** ${tournament.format}\n`;
    description += `**⚔️ Elimination:** ${tournament.eliminationType === 'DOUBLE' ? 'Double (lose twice to be eliminated)' : 'Single'}\n`;
    
    if (tournament.numHands) {
      description += `**🃏 Hands:** ${tournament.numHands}\n`;
    }
    
    description += `**🎲 Nils:** ${tournament.nilAllowed ? 'Allowed' : 'Not Allowed'}\n`;
    description += `**👁️ Blind Nils:** ${tournament.blindNilAllowed ? 'Allowed' : 'Not Allowed'}\n`;
    
    if (prizesText) {
      description += prizesText;
    }

    // Get registration stats
    const stats = tournament.registrations 
      ? this.calculateStats(tournament.registrations)
      : { teams: 0, unpartnered: 0 };

    description += `\n**Teams:** ${stats.teams}\n`;
    description += `**Need a Partner:** ${stats.unpartnered}`;

    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${tournament.name}`)
      .setDescription(description)
      .setColor(0x0099ff)
      .setTimestamp();

    if (tournament.bannerUrl) {
      embed.setImage(tournament.bannerUrl);
    }

    return embed;
  }

  /**
   * Build tournament action buttons
   */
  static buildTournamentButtons(tournamentId) {
    return new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`join_tournament_${tournamentId}`)
          .setLabel('Join')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`unregister_tournament_${tournamentId}`)
          .setLabel('Unregister')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`view_tournament_lobby_${tournamentId}`)
          .setLabel('View Lobby')
          .setStyle(ButtonStyle.Secondary)
      );
  }

  /**
   * Calculate registration statistics
   */
  static calculateStats(registrations) {
    // Count complete teams (both partners registered and marked complete)
    const completeTeams = registrations.filter(reg => reg.partnerId && reg.isComplete).length / 2;
    
    // Count players without partners
    const unpartneredPlayers = registrations.filter(reg => !reg.partnerId).length;

    return {
      teams: Math.floor(completeTeams),
      unpartnered: unpartneredPlayers,
    };
  }

  /**
   * Update tournament embed with latest registration stats
   */
  static async updateTournamentEmbed(client, tournament) {
    try {
      if (!tournament.discordMessageId || !tournament.discordChannelId) {
        console.warn('[DISCORD TOURNAMENT] Cannot update embed - missing Discord message info');
        return;
      }

      const channel = await client.channels.fetch(tournament.discordChannelId);
      if (!channel) {
        throw new Error(`Channel ${tournament.discordChannelId} not found`);
      }

      const message = await channel.messages.fetch(tournament.discordMessageId);
      if (!message) {
        throw new Error(`Message ${tournament.discordMessageId} not found`);
      }

      // Fetch fresh tournament data with registrations
      const freshTournament = await TournamentService.getTournament(tournament.id);
      const embed = this.buildTournamentEmbed(freshTournament);
      const components = this.buildTournamentButtons(tournament.id);

      await message.edit({
        embeds: [embed],
        components: [components],
      });

      console.log(`[DISCORD TOURNAMENT] Updated embed for tournament ${tournament.id}`);
    } catch (error) {
      console.error('[DISCORD TOURNAMENT] Error updating embed:', error);
      throw error;
    }
  }
}

