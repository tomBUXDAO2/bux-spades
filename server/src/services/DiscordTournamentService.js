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
  /**
   * Post "Good Luck" embed when tournament starts
   */
  static async postTournamentGoodLuckEmbed(client, tournament) {
    try {
      const channel = await client.channels.fetch(TOURNAMENT_CHANNEL_ID);
      if (!channel) {
        throw new Error(`Tournament channel ${TOURNAMENT_CHANNEL_ID} not found`);
      }

      const embed = new EmbedBuilder()
        .setTitle(`🏆 ${tournament.name} - Tournament Started!`)
        .setDescription(
          `**Good luck to all players!** 🎉\n\n` +
          `The tournament has officially begun. Check your match below and click **Ready** when you're prepared to play.\n\n` +
          `You have **5 minutes** to ready up. Games will start automatically once all 4 players are ready.`
        )
        .setColor(0x00ff00)
        .setTimestamp();

      if (tournament.bannerUrl) {
        embed.setImage(tournament.bannerUrl);
      }

      await channel.send({ embeds: [embed] });
      console.log(`[DISCORD TOURNAMENT] Posted good luck embed for tournament ${tournament.id}`);
    } catch (error) {
      console.error('[DISCORD TOURNAMENT] Error posting good luck embed:', error);
      throw error;
    }
  }

  /**
   * Post ready embeds for each game with ready buttons
   */
  static async postTournamentReadyEmbeds(client, tournament, matchesToPost = null) {
    try {
      const channel = await client.channels.fetch(TOURNAMENT_CHANNEL_ID);
      if (!channel) {
        throw new Error(`Tournament channel ${TOURNAMENT_CHANNEL_ID} not found`);
      }

      const { TournamentReadyService } = await import('./TournamentReadyService.js');
      const { prisma } = await import('../config/database.js');

      // Get matches to post (either provided or first round)
      let matches;
      if (matchesToPost) {
        matches = matchesToPost;
      } else {
        matches = await prisma.tournamentMatch.findMany({
          where: {
            tournamentId: tournament.id,
            round: 1,
            team2Id: { not: null }, // Exclude byes
          },
          orderBy: { matchNumber: 'asc' },
        });
      }

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

      // Post embed for each match with ready button
      for (const match of matches) {
        const team1Players = teamIdToPlayers.get(match.team1Id) || [];
        const team2Players = match.team2Id ? (teamIdToPlayers.get(match.team2Id) || []) : null;

        if (team1Players.length === 0 || !team2Players || team2Players.length === 0) {
          console.warn(`[TOURNAMENT] Skipping match ${match.id} - missing team players`);
          continue;
        }

        const allPlayerIds = [
          ...team1Players.map(p => p.id),
          ...team2Players.map(p => p.id),
        ];

        // Initialize ready status and set 5-minute timer
        const expiryTimestamp = Date.now() + (5 * 60 * 1000);
        await TournamentReadyService.setTimer(match.id, expiryTimestamp);

        // Build embed
        const readyStatus = await TournamentReadyService.getReadyStatus(match.id);
        const timeRemaining = await TournamentReadyService.getTimeRemaining(match.id);
        const embed = TournamentReadyService.buildReadyEmbed(
          match,
          tournament,
          teamIdToPlayers,
          readyStatus,
          timeRemaining
        );

        // Build ready button
        const readyButton = TournamentReadyService.buildReadyButton(match.id);
        const row = new ActionRowBuilder().addComponents(readyButton);

        // Tag all players
        const mentions = [
          ...team1Players.map(p => `<@${p.discordId}>`),
          ...team2Players.map(p => `<@${p.discordId}>`),
        ].join(' ');

        await channel.send({
          content: mentions,
          embeds: [embed],
          components: [row],
        });
      }

      // Post bye teams separately (only for first round)
      if (!matchesToPost) {
        const byeMatches = await prisma.tournamentMatch.findMany({
          where: {
            tournamentId: tournament.id,
            round: 1,
            OR: [
              { team2Id: null },
              { status: 'COMPLETED' },
            ],
          },
          orderBy: { matchNumber: 'asc' },
        });

        if (byeMatches.length > 0) {
        const teamsWithByes = [];
        for (const match of byeMatches) {
          const team1Players = teamIdToPlayers.get(match.team1Id) || [];
          if (team1Players.length > 0) {
            teamsWithByes.push(team1Players.map(p => `<@${p.discordId}>`).join(' & '));
          }
        }

        if (teamsWithByes.length > 0) {
          const embed = new EmbedBuilder()
            .setTitle('🎁 Teams with Byes - Automatic Advance')
            .setDescription(
              `The following teams have a bye and automatically advance to the next round:\n\n` +
              teamsWithByes.map((team, idx) => `**${idx + 1}.** ${team}`).join('\n')
            )
            .setColor(0xffaa00)
            .setTimestamp();

          await channel.send({ embeds: [embed] });
        }
        }
      }

      console.log(`[DISCORD TOURNAMENT] Posted ready embeds for ${matches.length} matches`);
    } catch (error) {
      console.error('[DISCORD TOURNAMENT] Error posting ready embeds:', error);
      throw error;
    }
  }

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

  /**
   * Create game and post "Table Up" embed when all players are ready
   */
  static async createGameAndPostTableUp(client, match, tournament) {
    try {
      const { GameService } = await import('./GameService.js');
      const { prisma } = await import('../config/database.js');
      const channel = await client.channels.fetch(TOURNAMENT_CHANNEL_ID);
      
      if (!channel) {
        throw new Error(`Tournament channel ${TOURNAMENT_CHANNEL_ID} not found`);
      }

      // Build team ID to player IDs map
      const teamIdToPlayerIds = new Map();
      const registrations = await prisma.tournamentRegistration.findMany({
        where: { tournamentId: tournament.id },
        include: { user: true, partner: true },
      });

      for (const reg of registrations) {
        if (reg.partnerId && reg.isComplete) {
          const teamId = `team_${reg.userId}_${reg.partnerId}`;
          if (!teamIdToPlayerIds.has(teamId)) {
            teamIdToPlayerIds.set(teamId, [reg.userId, reg.partnerId]);
          }
        } else if (!reg.partnerId && !reg.isSub) {
          const teamId = `team_${reg.userId}`;
          teamIdToPlayerIds.set(teamId, [reg.userId]);
        }
      }

      const team1Players = teamIdToPlayerIds.get(match.team1Id) || [];
      const team2Players = match.team2Id ? (teamIdToPlayerIds.get(match.team2Id) || []) : null;

      if (team1Players.length === 0 || !team2Players || team2Players.length === 0) {
        throw new Error('Missing team players for match');
      }

      // Create game
      const gameId = `tournament_${tournament.id}_match_${match.id}`;
      const gameData = {
        id: gameId,
        createdById: team1Players[0],
        mode: tournament.mode,
        format: tournament.format,
        gimmickVariant: tournament.gimmickVariant,
        isLeague: true,
        isRated: true,
        maxPoints: tournament.maxPoints || 500,
        minPoints: tournament.minPoints || -100,
        buyIn: tournament.buyIn || 0,
        nilAllowed: tournament.nilAllowed !== false,
        blindNilAllowed: tournament.blindNilAllowed || false,
        specialRules: tournament.specialRules || {},
        status: 'WAITING',
      };

      const game = await GameService.createGame(gameData);

      // Add players to game
      const allPlayers = [...team1Players, ...team2Players];
      for (let i = 0; i < allPlayers.length && i < 4; i++) {
        const userId = allPlayers[i];
        const seatIndex = i;
        const teamIndex = tournament.mode === 'PARTNERS' ? (i < 2 ? 0 : 1) : i;

        await prisma.gamePlayer.create({
          data: {
            gameId: game.id,
            userId,
            seatIndex,
            teamIndex,
            isHuman: true,
            joinedAt: new Date(),
          },
        });
      }

      // Update match with game ID
      await prisma.tournamentMatch.update({
        where: { id: match.id },
        data: { gameId: game.id, status: 'IN_PROGRESS' },
      });

      // Post "Table Up" embed - team1Players and team2Players are already user IDs
      const team1Mentions = team1Players.map(userId => {
        const reg = registrations.find(r => r.userId === userId || r.partnerId === userId);
        if (reg) {
          if (reg.userId === userId) {
            return `<@${reg.user.discordId}>`;
          } else if (reg.partnerId === userId) {
            const partnerReg = registrations.find(r => r.userId === userId);
            return `<@${partnerReg?.user?.discordId}>`;
          }
        }
        return '';
      }).filter(Boolean).join(' & ');

      const team2Mentions = team2Players.map(userId => {
        const reg = registrations.find(r => r.userId === userId || r.partnerId === userId);
        if (reg) {
          if (reg.userId === userId) {
            return `<@${reg.user.discordId}>`;
          } else if (reg.partnerId === userId) {
            const partnerReg = registrations.find(r => r.userId === userId);
            return `<@${partnerReg?.user?.discordId}>`;
          }
        }
        return '';
      }).filter(Boolean).join(' & ');

      const allMentions = [
        ...team1Players.map(userId => {
          const reg = registrations.find(r => r.userId === userId || r.partnerId === userId);
          if (reg) {
            return reg.userId === userId ? `<@${reg.user.discordId}>` : `<@${registrations.find(r => r.userId === userId)?.user?.discordId}>`;
          }
          return '';
        }),
        ...team2Players.map(userId => {
          const reg = registrations.find(r => r.userId === userId || r.partnerId === userId);
          if (reg) {
            return reg.userId === userId ? `<@${reg.user.discordId}>` : `<@${registrations.find(r => r.userId === userId)?.user?.discordId}>`;
          }
          return '';
        }),
      ].filter(Boolean).join(' ');

      const clientUrl = process.env.CLIENT_URL || 'https://www.bux-spades.pro';
      const gameUrl = `${clientUrl}/game/${gameId}`;

      const embed = new EmbedBuilder()
        .setTitle(`✅ Match ${match.matchNumber} - Table Up!`)
        .setDescription(
          `All players are ready! The game table is now available.\n\n` +
          `**Team 1:** ${team1Mentions}\n` +
          `**Team 2:** ${team2Mentions}\n\n` +
          `🔗 **Game Link:** ${gameUrl}\n\n` +
          `*Click the link above to join your game table.*`
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await channel.send({
        content: allMentions,
        embeds: [embed],
      });

      console.log(`[DISCORD TOURNAMENT] Created game ${gameId} and posted table up embed`);
    } catch (error) {
      console.error('[DISCORD TOURNAMENT] Error creating game and posting table up:', error);
      throw error;
    }
  }

  /**
   * Handle timer expiry for a match
   * Scenarios are based on how many players actually clicked ready:
   * - 3/4 ready: Show missing player, prompt admin for sub
   * - 2/4 ready: Void game, 2 present players become team and progress
   * - 1/4 ready: Team with 0 ready forfeits, prompt admin for sub to partner with 1 ready player
   * - 0/4 ready: Game voided, nobody progresses, next round opponent gets bye
   */
  static async handleTimerExpiry(client, match, tournament, expiryCheck) {
    try {
      const { prisma } = await import('../config/database.js');
      const { TournamentBracketService } = await import('./TournamentBracketService.js');
      const channel = await client.channels.fetch(TOURNAMENT_CHANNEL_ID);
      const { TournamentReadyService } = await import('./TournamentReadyService.js');

      // Clear ready status
      await TournamentReadyService.clearReadyStatus(match.id);

      // Get registrations to find players
      const registrations = await prisma.tournamentRegistration.findMany({
        where: { tournamentId: tournament.id },
        include: { user: true, partner: true },
      });

      // Build team ID to player IDs map
      const teamIdToPlayerIds = new Map();
      for (const reg of registrations) {
        if (reg.partnerId && reg.isComplete) {
          const teamId = `team_${reg.userId}_${reg.partnerId}`;
          if (!teamIdToPlayerIds.has(teamId)) {
            teamIdToPlayerIds.set(teamId, [reg.userId, reg.partnerId]);
          }
        } else if (!reg.partnerId && !reg.isSub) {
          const teamId = `team_${reg.userId}`;
          teamIdToPlayerIds.set(teamId, [reg.userId]);
        }
      }

      const team1Players = teamIdToPlayerIds.get(match.team1Id) || [];
      const team2Players = match.team2Id ? (teamIdToPlayerIds.get(match.team2Id) || []) : null;
      const allPlayers = [...team1Players, ...(team2Players || [])];

      // Get missing and ready players
      const missingPlayerIds = expiryCheck.missingPlayerIds || [];
      const readyPlayerIds = expiryCheck.readyPlayerIds || [];
      const readyCount = readyPlayerIds.length;

      console.log('[DISCORD TOURNAMENT] Timer expiry scenario', {
        matchId: match.id,
        readyPlayerIds,
        missingPlayerIds,
        readyCount,
        expectedPlayers: allPlayers,
      });

      if (readyCount === 0) {
        // 0/4 ready: Game voided, nobody progresses, next round opponent gets bye
        await prisma.tournamentMatch.update({
          where: { id: match.id },
          data: {
            status: 'COMPLETED',
            winnerId: null, // No winner - game voided
          },
        });

        // Advance bracket with null winner (creates bye)
        await TournamentBracketService.advanceBracket(tournament.id, match, null);

        const embed = new EmbedBuilder()
          .setTitle(`❌ Match ${match.matchNumber} - Game Voided`)
          .setDescription(
            `**Timer expired!** No players ready up.\n\n` +
            `**Game voided.** Nobody progresses.\n\n` +
            `*The next round opponent will receive a bye.*`
          )
          .setColor(0xff0000)
          .setTimestamp();

        await channel.send({ embeds: [embed] });

      } else if (readyCount === 3) {
        // 3/4 ready: Show missing player, prompt admin for sub
        const missingUserId = missingPlayerIds[0];
        const missingReg = registrations.find(r => r.userId === missingUserId || r.partnerId === missingUserId);
        const missingDiscordId = missingReg?.user?.discordId || missingReg?.partner?.discordId;

        const readyRegs = registrations.filter(r => 
          readyPlayerIds.includes(r.userId) || (r.partnerId && readyPlayerIds.includes(r.partnerId))
        );
        const readyMentions = readyRegs.map(r => {
          if (readyPlayerIds.includes(r.userId)) {
            return `<@${r.user.discordId}>`;
          } else if (r.partnerId && readyPlayerIds.includes(r.partnerId)) {
            return `<@${r.partner?.discordId}>`;
          }
          return '';
        }).filter(Boolean).join(', ');

        const embed = new EmbedBuilder()
          .setTitle(`⚠️ Match ${match.matchNumber} - 1 Player Missing`)
          .setDescription(
            `**Timer expired!** 1 player did not ready up.\n\n` +
            `**Ready Players (3/4):** ${readyMentions}\n` +
            `**Missing Player:** <@${missingDiscordId}>\n\n` +
            `**Admins:** Please use \`/tournament-sub\` command to assign a substitute player.\n` +
            `Format: \`/tournament-sub match:${match.id} player:<discordId>\``
          )
          .setColor(0xff9900)
          .setTimestamp();

        await channel.send({ embeds: [embed] });

      } else if (readyCount === 2) {
        // 2/4 ready: Void game, 2 present players become a team and progress
        // Extract actual user IDs (not partner IDs)
        const actualReadyUserIds = readyPlayerIds.filter(id => {
          const reg = registrations.find(r => r.userId === id);
          return reg && !reg.isSub;
        });
        
        if (actualReadyUserIds.length !== 2) {
          console.error(`[TOURNAMENT] Expected 2 ready players but found ${actualReadyUserIds.length}`);
          return;
        }

        // Create new team from the 2 present players
        const player1Id = actualReadyUserIds[0];
        const player2Id = actualReadyUserIds[1];

        // Mark match as completed with new team as winner
        const newTeamId = `team_${player1Id}_${player2Id}`;
        
        await prisma.tournamentMatch.update({
          where: { id: match.id },
          data: {
            status: 'COMPLETED',
            winnerId: newTeamId,
          },
        });

        // Advance bracket with new team
        const advanceResult = await TournamentBracketService.advanceBracket(tournament.id, match, newTeamId);

        const readyMentions = actualReadyUserIds.map(userId => {
          const reg = registrations.find(r => r.userId === userId);
          return `<@${reg?.user?.discordId}>`;
        }).filter(Boolean).join(' & ');

        const embed = new EmbedBuilder()
          .setTitle(`✅ Match ${match.matchNumber} - Auto-Advanced`)
          .setDescription(
            `**Timer expired!** 2 players did not ready up.\n\n` +
            `**Game voided.** The 2 present players form a new team and automatically advance:\n` +
            `${readyMentions}\n\n` +
            `*This team will continue as a pair for the rest of the tournament.*`
          )
          .setColor(0xff9900)
          .setTimestamp();

        await channel.send({ embeds: [embed] });
        
        // Check if tournament is complete (only one team left)
        if (advanceResult?.completed && advanceResult?.winnerTeamId) {
          await this.postTournamentWinnerEmbed(client, tournament, advanceResult.winnerTeamId);
        }

      } else if (readyCount === 1) {
        // 1/4 ready: Team with 0 ready forfeits, prompt admin for sub to partner with 1 ready player
        const readyUserId = readyPlayerIds[0];
        const readyReg = registrations.find(r => r.userId === readyUserId);
        
        if (!readyReg) {
          console.error(`[TOURNAMENT] Ready player not found: ${readyUserId}`);
          return;
        }

        // Determine which team forfeited (the one with 0 ready players)
        const team1Ready = team1Players.some(id => readyPlayerIds.includes(id));
        const team2Ready = team2Players && team2Players.some(id => readyPlayerIds.includes(id));
        
        let forfeitingTeamName = 'Unknown Team';
        if (!team1Ready) {
          forfeitingTeamName = `Team 1 (${match.team1Id})`;
        } else if (!team2Ready) {
          forfeitingTeamName = `Team 2 (${match.team2Id})`;
        }

        const missingRegs = registrations.filter(r => 
          missingPlayerIds.includes(r.userId) || (r.partnerId && missingPlayerIds.includes(r.partnerId))
        );
        const missingMentions = missingRegs.map(r => {
          if (missingPlayerIds.includes(r.userId)) {
            return `<@${r.user.discordId}>`;
          } else if (r.partnerId && missingPlayerIds.includes(r.partnerId)) {
            return `<@${r.partner?.discordId}>`;
          }
          return '';
        }).filter(Boolean).join(', ');

        const embed = new EmbedBuilder()
          .setTitle(`⚠️ Match ${match.matchNumber} - Team Forfeited`)
          .setDescription(
            `**Timer expired!** 3 players did not ready up.\n\n` +
            `**Ready Player:** <@${readyReg.user.discordId}>\n` +
            `**Missing Players:** ${missingMentions}\n\n` +
            `**${forfeitingTeamName} forfeits.**\n\n` +
            `**Admins:** Please use \`/tournament-sub\` command to assign a substitute partner for the ready player.\n` +
            `Format: \`/tournament-sub match:${match.id} player:<discordId>\``
          )
          .setColor(0xff9900)
          .setTimestamp();

        await channel.send({ embeds: [embed] });
      } else {
        console.warn('[DISCORD TOURNAMENT] Unhandled timer expiry scenario', {
          matchId: match.id,
          readyPlayerIds,
          missingPlayerIds,
          readyCount,
          expectedPlayers: allPlayers,
        });
      }

      console.log(`[DISCORD TOURNAMENT] Handled timer expiry for match ${match.id} - ${missingCount} missing`);
    } catch (error) {
      console.error('[DISCORD TOURNAMENT] Error handling timer expiry:', error);
      throw error;
    }
  }

  /**
   * Post tournament match result and check for next round matches
   */
  static async postTournamentMatchResult(client, match, game, winnerTeamId, advanceResult = null) {
    try {
      const { prisma } = await import('../config/database.js');
      const channel = await client.channels.fetch(TOURNAMENT_CHANNEL_ID);
      
      if (!channel) {
        throw new Error(`Tournament channel ${TOURNAMENT_CHANNEL_ID} not found`);
      }

      // Get tournament with registrations
      const tournament = await prisma.tournament.findUnique({
        where: { id: match.tournamentId },
        include: {
          registrations: {
            include: { user: true, partner: true },
          },
        },
      });

      if (!tournament) {
        console.error(`[DISCORD TOURNAMENT] Tournament not found: ${match.tournamentId}`);
        return;
      }

      // Build team ID to players map
      const teamIdToPlayers = new Map();
      for (const reg of tournament.registrations) {
        if (reg.partnerId && reg.isComplete) {
          const teamId = `team_${reg.userId}_${reg.partnerId}`;
          if (!teamIdToPlayers.has(teamId)) {
            teamIdToPlayers.set(teamId, [
              { discordId: reg.user.discordId, username: reg.user.username },
              { discordId: reg.partner?.discordId, username: reg.partner?.username },
            ]);
          }
        } else if (!reg.partnerId && !reg.isSub) {
          const teamId = `team_${reg.userId}`;
          teamIdToPlayers.set(teamId, [
            { discordId: reg.user.discordId, username: reg.user.username },
          ]);
        }
      }

      // Get winner players
      const winnerPlayers = teamIdToPlayers.get(winnerTeamId) || [];
      const winnerMentions = winnerPlayers.map(p => `<@${p.discordId}>`).join(' & ');

      // Post result embed
      const embed = new EmbedBuilder()
        .setTitle(`🏆 Match ${match.matchNumber} - Complete!`)
        .setDescription(
          `**Winner:** ${winnerMentions}\n\n` +
          `*Bracket has been updated. Next round matches will be called shortly.*`
        )
        .setColor(0x00ff00)
        .setTimestamp();

      await channel.send({ embeds: [embed] });

      // Check for next round matches ready to be called
      await this.checkAndCallNextRoundMatches(client, tournament, match);

      console.log(`[DISCORD TOURNAMENT] Posted match result for match ${match.id}`);
    } catch (error) {
      console.error('[DISCORD TOURNAMENT] Error posting match result:', error);
      throw error;
    }
  }

  /**
   * Check for next round matches that are ready to be called
   */
  static async checkAndCallNextRoundMatches(client, tournament, completedMatch) {
    try {
      const { prisma } = await import('../config/database.js');
      
      // Determine next round based on completed match
      const nextRound = completedMatch.round + (completedMatch.round < 1000 ? 100 : 0);
      const nextMatchNumber = Math.ceil(completedMatch.matchNumber / 2);

      // Get all matches in the next round
      const nextRoundMatches = await prisma.tournamentMatch.findMany({
        where: {
          tournamentId: tournament.id,
          round: nextRound,
        },
        orderBy: { matchNumber: 'asc' },
      });

      // Check each match to see if both teams are determined
      const readyMatches = [];
      for (const nextMatch of nextRoundMatches) {
        if (nextMatch.team1Id && nextMatch.team2Id && nextMatch.status === 'PENDING') {
          // Both teams determined - call the game
          readyMatches.push(nextMatch);
        }
      }

      // Post ready embeds for matches that are ready
      if (readyMatches.length > 0) {
        await this.postTournamentReadyEmbeds(client, tournament, readyMatches);
      }
    } catch (error) {
      console.error('[DISCORD TOURNAMENT] Error checking next round matches:', error);
    }
  }
  
  /**
   * Post tournament winner embed with prizes
   */
  static async postTournamentWinnerEmbed(client, tournament, winnerTeamId) {
    try {
      const { prisma } = await import('../config/database.js');
      const channel = await client.channels.fetch(TOURNAMENT_CHANNEL_ID);
      
      // Get tournament with registrations
      const fullTournament = await prisma.tournament.findUnique({
        where: { id: tournament.id },
        include: {
          registrations: {
            include: { user: true, partner: true },
          },
        },
      });
      
      if (!fullTournament) return;
      
      // Parse winner team ID to get player IDs
      const winnerParts = winnerTeamId.replace('team_', '').split('_');
      const winnerPlayers = winnerParts.map(userId => {
        const reg = fullTournament.registrations.find(r => r.userId === userId);
        if (reg) {
          return { username: reg.user.username, discordId: reg.user.discordId };
        }
        // Try partner
        const partnerReg = fullTournament.registrations.find(r => r.partnerId === userId);
        if (partnerReg) {
          return { username: partnerReg.partner?.username || 'Unknown', discordId: partnerReg.partner?.discordId };
        }
        return null;
      }).filter(Boolean);
      
      // Find runners-up (second place team from final match)
      const finalMatch = await prisma.tournamentMatch.findFirst({
        where: {
          tournamentId: tournament.id,
          round: { gte: 1000 },
        },
        orderBy: { round: 'desc' },
      });
      
      let runnersUpPlayers = [];
      if (finalMatch) {
        const runnersUpTeamId = finalMatch.team1Id === winnerTeamId ? finalMatch.team2Id : finalMatch.team1Id;
        if (runnersUpTeamId) {
          const runnersUpParts = runnersUpTeamId.replace('team_', '').split('_');
          runnersUpPlayers = runnersUpParts.map(userId => {
            const reg = fullTournament.registrations.find(r => r.userId === userId);
            if (reg) {
              return { username: reg.user.username, discordId: reg.user.discordId };
            }
            const partnerReg = fullTournament.registrations.find(r => r.partnerId === userId);
            if (partnerReg) {
              return { username: partnerReg.partner?.username || 'Unknown', discordId: partnerReg.partner?.discordId };
            }
            return null;
          }).filter(Boolean);
        }
      }
      
      const winnerMentions = winnerPlayers.map(p => `<@${p.discordId}>`).join(' & ');
      const runnersUpMentions = runnersUpPlayers.length > 0 
        ? runnersUpPlayers.map(p => `<@${p.discordId}>`).join(' & ')
        : 'N/A';
      
      const winnerPrize = tournament.winnerPrize || '10mil each';
      const runnerUpPrize = tournament.runnerUpPrize || '6mil each';
      
      const embed = new EmbedBuilder()
        .setTitle(`🏆 Tournament Complete - Winners!`)
        .setDescription(
          `**Congratulations to our tournament winners!**\n\n` +
          `**🥇 Winners:** ${winnerMentions}\n` +
          `**Prize:** ${winnerPrize}\n\n` +
          (runnersUpPlayers.length > 0 ? 
            `**🥈 Runners-Up:** ${runnersUpMentions}\n` +
            `**Prize:** ${runnerUpPrize}\n\n` : '') +
          `Thank you to everyone who participated! We hope you had fun and we'll see you in the next tournament! 🎉`
        )
        .setColor(0xffd700)
        .setTimestamp();
      
      await channel.send({ 
        content: winnerMentions,
        embeds: [embed] 
      });
      
      console.log(`[DISCORD TOURNAMENT] Posted winner embed for tournament ${tournament.id}`);
    } catch (error) {
      console.error('[DISCORD TOURNAMENT] Error posting winner embed:', error);
    }
  }
  
  /**
   * Post elimination embed when a team is eliminated
   */
  static async postEliminationEmbed(client, tournament, eliminatedTeamId, match) {
    try {
      const { prisma } = await import('../config/database.js');
      const channel = await client.channels.fetch(TOURNAMENT_CHANNEL_ID);
      
      // Get tournament with registrations
      const fullTournament = await prisma.tournament.findUnique({
        where: { id: tournament.id },
        include: {
          registrations: {
            include: { user: true, partner: true },
          },
        },
      });
      
      if (!fullTournament) return;
      
      // Count defeats for this team (only in double elimination)
      if (tournament.eliminationType === 'DOUBLE') {
        const defeats = await prisma.tournamentMatch.count({
          where: {
            tournamentId: tournament.id,
            OR: [
              { team1Id: eliminatedTeamId, winnerId: { not: eliminatedTeamId } },
              { team2Id: eliminatedTeamId, winnerId: { not: eliminatedTeamId } },
            ],
            status: 'COMPLETED',
          },
        });
        
        // Only post elimination embed after 2 defeats
        if (defeats < 2) {
          return; // Not eliminated yet
        }
      }
      
      // Parse eliminated team ID to get player IDs
      const eliminatedParts = eliminatedTeamId.replace('team_', '').split('_');
      const eliminatedPlayers = eliminatedParts.map(userId => {
        const reg = fullTournament.registrations.find(r => r.userId === userId);
        if (reg) {
          return { username: reg.user.username, discordId: reg.user.discordId };
        }
        const partnerReg = fullTournament.registrations.find(r => r.partnerId === userId);
        if (partnerReg) {
          return { username: partnerReg.partner?.username || 'Unknown', discordId: partnerReg.partner?.discordId };
        }
        return null;
      }).filter(Boolean);
      
      if (eliminatedPlayers.length === 0) return;
      
      const eliminatedMentions = eliminatedPlayers.map(p => `<@${p.discordId}>`).join(' & ');
      
      const embed = new EmbedBuilder()
        .setTitle(`❌ Team Eliminated`)
        .setDescription(
          `**${eliminatedMentions}** have been eliminated from the tournament.\n\n` +
          `Thank you for playing! We hope you had fun and we'll see you in the next tournament! 🎉`
        )
        .setColor(0xff0000)
        .setTimestamp();
      
      await channel.send({ 
        content: eliminatedMentions,
        embeds: [embed] 
      });
      
      console.log(`[DISCORD TOURNAMENT] Posted elimination embed for team ${eliminatedTeamId}`);
    } catch (error) {
      console.error('[DISCORD TOURNAMENT] Error posting elimination embed:', error);
    }
  }
}
