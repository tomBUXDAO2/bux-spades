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

      // Check if bot has permission to send messages
      const botMember = await channel.guild.members.fetch(client.user.id);
      const permissions = channel.permissionsFor(botMember);
      
      if (!permissions.has('ViewChannel')) {
        throw new Error(`Bot does not have 'View Channel' permission in tournament channel ${TOURNAMENT_CHANNEL_ID}`);
      }
      
      if (!permissions.has('SendMessages')) {
        throw new Error(`Bot does not have 'Send Messages' permission in tournament channel ${TOURNAMENT_CHANNEL_ID}`);
      }
      
      if (!permissions.has('EmbedLinks')) {
        throw new Error(`Bot does not have 'Embed Links' permission in tournament channel ${TOURNAMENT_CHANNEL_ID}`);
      }

      const embed = this.buildTournamentEmbed(tournament);
      const registrationClosed = tournament.status === 'REGISTRATION_CLOSED' || tournament.status === 'IN_PROGRESS';
      const components = this.buildTournamentButtons(tournament.id, registrationClosed);

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
      
      // Provide helpful error message for permission issues
      if (error.code === 50001 || error.message?.includes('Missing Access') || error.message?.includes('permission')) {
        const helpfulError = new Error(
          `Bot lacks permission to post in tournament channel ${TOURNAMENT_CHANNEL_ID}. ` +
          `Please ensure the bot has the following permissions in that channel: ` +
          `View Channel, Send Messages, Embed Links, and Attach Files. ` +
          `Original error: ${error.message}`
        );
        helpfulError.code = error.code;
        throw helpfulError;
      }
      
      throw error;
    }
  }

  /**
   * Build tournament registration embed
   */
  static buildTournamentEmbed(tournament) {
    const startTimestamp = Math.floor(new Date(tournament.startTime).getTime() / 1000);
    
    // Format tournament entry fee
    const formatCoins = (value) => {
      if (!value) return 'Free';
      if (value >= 1000000) {
        const millions = value / 1000000;
        return Number.isInteger(millions) ? `${millions}M` : `${millions.toFixed(1)}M`;
      }
      const thousands = value / 1000;
      return Number.isInteger(thousands) ? `${thousands}k` : `${thousands.toFixed(1)}k`;
    };

    const entryFeeStr = tournament.tournamentBuyIn 
      ? `${formatCoins(tournament.tournamentBuyIn)} coins`
      : 'Free Entry';
    
    const tableBuyInStr = tournament.buyIn 
      ? `${formatCoins(tournament.buyIn)} coins per game`
      : 'Free Games';

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
    
    // Show registration status
    if (tournament.status === 'REGISTRATION_CLOSED') {
      description += `**🔒 Registration:** CLOSED - Bracket Finalized\n`;
    } else if (tournament.status === 'IN_PROGRESS') {
      description += `**▶️ Status:** IN PROGRESS\n`;
    } else {
      description += `**✅ Registration:** OPEN\n`;
    }
    
    description += `**🎮 Mode:** ${tournament.mode}\n`;
    description += `**💰 Entry Fee:** ${entryFeeStr}\n`;
    description += `**🎲 Table Buy-in:** ${tableBuyInStr}\n`;
    description += `**📊 Points:** ${tournament.minPoints || -100} to ${tournament.maxPoints || 500}\n`;
    description += `**🎯 Format:** ${tournament.format}\n`;
    description += `**⚔️ Elimination:** ${tournament.eliminationType === 'DOUBLE' ? 'Double (lose twice to be eliminated)' : 'Single'}\n`;
    
    // Only show nil settings if format is REGULAR
    if (tournament.format === 'REGULAR') {
      description += `**🎲 Nils:** ${tournament.nilAllowed ? 'Allowed' : 'Not Allowed'}\n`;
      description += `**👁️ Blind Nils:** ${tournament.blindNilAllowed ? 'Allowed' : 'Not Allowed'}\n`;
    }
    
    // Show special rules if present
    if (tournament.specialRules) {
      const rules = typeof tournament.specialRules === 'string' 
        ? JSON.parse(tournament.specialRules) 
        : tournament.specialRules;
      
      if (rules.specialRule1 && rules.specialRule1.length > 0) {
        const rule1 = Array.isArray(rules.specialRule1) ? rules.specialRule1.join(', ') : rules.specialRule1;
        description += `**⚡ Special Rule #1:** ${rule1}\n`;
      }
      if (rules.specialRule2 && rules.specialRule2.length > 0) {
        const rule2 = Array.isArray(rules.specialRule2) ? rules.specialRule2.join(', ') : rules.specialRule2;
        description += `**⚡ Special Rule #2:** ${rule2}\n`;
      }
    }
    
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
  static buildTournamentButtons(tournamentId, registrationClosed = false) {
    const buttons = [];
    
    if (!registrationClosed) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`join_tournament_${tournamentId}`)
          .setLabel('Join')
          .setStyle(ButtonStyle.Primary)
      );
    }
    
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`unregister_tournament_${tournamentId}`)
        .setLabel('Unregister')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(registrationClosed), // Disable unregister when registration is closed
      new ButtonBuilder()
        .setCustomId(`view_tournament_lobby_${tournamentId}`)
        .setLabel('View Lobby')
        .setStyle(ButtonStyle.Secondary)
    );
    
    return new ActionRowBuilder().addComponents(buttons);
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
      const registrationClosed = freshTournament.status === 'REGISTRATION_CLOSED' || freshTournament.status === 'IN_PROGRESS';
      const components = this.buildTournamentButtons(tournament.id, registrationClosed);

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

  /**
   * Post tournament start embed with match details and player tags
   */
  static async postTournamentStartEmbed(client, tournament, createdGames) {
    try {
      const channel = await client.channels.fetch(TOURNAMENT_CHANNEL_ID);
      if (!channel) {
        throw new Error(`Tournament channel ${TOURNAMENT_CHANNEL_ID} not found`);
      }

      // Get all first round matches (including byes)
      const { prisma } = await import('../config/database.js');
      const firstRoundMatches = await prisma.tournamentMatch.findMany({
        where: {
          tournamentId: tournament.id,
          round: 1,
        },
        orderBy: { matchNumber: 'asc' },
      });

      // Get all registrations with user info
      const registrations = await prisma.tournamentRegistration.findMany({
        where: { tournamentId: tournament.id },
        include: {
          user: true,
          partner: true,
        },
      });

      // Build team ID to players map
      const teamIdToPlayers = new Map();
      for (const reg of registrations) {
        if (reg.partnerId && reg.isComplete) {
          const teamId = `team_${reg.userId}_${reg.partnerId}`;
          if (!teamIdToPlayers.has(teamId)) {
            teamIdToPlayers.set(teamId, [
              { id: reg.userId, discordId: reg.user.discordId, username: reg.user.username },
              { id: reg.partnerId, discordId: reg.partner?.discordId, username: reg.partner?.username },
            ]);
          }
        } else if (!reg.partnerId && !reg.isSub) {
          const teamId = `team_${reg.userId}`;
          teamIdToPlayers.set(teamId, [
            { id: reg.userId, discordId: reg.user.discordId, username: reg.user.username },
          ]);
        }
      }

      // Build match descriptions
      const matchDescriptions = [];
      const allPlayerMentions = new Set();
      const teamsWithByes = [];

      for (const match of firstRoundMatches) {
        const team1Players = teamIdToPlayers.get(match.team1Id) || [];
        const team2Players = match.team2Id ? (teamIdToPlayers.get(match.team2Id) || []) : null;

        if (match.status === 'COMPLETED' || !match.team2Id) {
          // Bye - team automatically advances
          const team1Mentions = team1Players.map(p => `<@${p.discordId}>`).join(' & ');
          teamsWithByes.push(team1Mentions);
          matchDescriptions.push(`**Match ${match.matchNumber}:** ${team1Mentions} - **BYE** (automatic advance)`);
          team1Players.forEach(p => allPlayerMentions.add(p.discordId));
        } else {
          // Regular match
          const team1Mentions = team1Players.map(p => `<@${p.discordId}>`).join(' & ');
          const team2Mentions = team2Players.map(p => `<@${p.discordId}>`).join(' & ');
          matchDescriptions.push(`**Match ${match.matchNumber}:** ${team1Mentions} vs ${team2Mentions}`);
          [...team1Players, ...team2Players].forEach(p => allPlayerMentions.add(p.discordId));
        }
      }

      // Build embed
      const embed = new EmbedBuilder()
        .setTitle(`🏆 ${tournament.name} - Tournament Started!`)
        .setDescription(
          `The tournament has begun! Here are the first round matches:\n\n` +
          matchDescriptions.join('\n') +
          (teamsWithByes.length > 0 ? `\n\n**Teams with Byes:**\n${teamsWithByes.join(', ')}` : '')
        )
        .setColor(0x00ff00)
        .setTimestamp();

      if (tournament.bannerUrl) {
        embed.setImage(tournament.bannerUrl);
      }

      // Post with all player mentions
      const mentions = Array.from(allPlayerMentions).map(id => `<@${id}>`).join(' ');
      await channel.send({
        content: mentions || undefined,
        embeds: [embed],
      });

      console.log(`[DISCORD TOURNAMENT] Posted start embed for tournament ${tournament.id}`);
    } catch (error) {
      console.error('[DISCORD TOURNAMENT] Error posting start embed:', error);
      throw error;
    }
  }

  /**
   * Post bracket finalized embed to Discord
   */
  static async postBracketFinalizedEmbed(client, tournament, teams) {
    try {
      const channel = await client.channels.fetch(TOURNAMENT_CHANNEL_ID);
      if (!channel) {
        throw new Error(`Tournament channel ${TOURNAMENT_CHANNEL_ID} not found`);
      }

      const embed = new EmbedBuilder()
        .setTitle(`🔒 ${tournament.name} - Registration Closed`)
        .setDescription(
          `**Registration is now closed and the bracket has been finalized!**\n\n` +
          `**Teams:** ${teams.length}\n` +
          `**Status:** Bracket ready - Tournament will start soon\n\n` +
          `View the bracket and match details in the tournament lobby.`
        )
        .setColor(0xff9900)
        .setTimestamp();

      if (tournament.bannerUrl) {
        embed.setImage(tournament.bannerUrl);
      }

      await channel.send({
        embeds: [embed],
      });

      console.log(`[DISCORD TOURNAMENT] Posted bracket finalized embed for tournament ${tournament.id}`);
    } catch (error) {
      console.error('[DISCORD TOURNAMENT] Error posting bracket finalized embed:', error);
      throw error;
    }
  }
}

