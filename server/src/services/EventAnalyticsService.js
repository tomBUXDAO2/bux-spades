import EventFilterService from './EventFilterService.js';
import EventService from './EventService.js';
import { EmbedBuilder } from 'discord.js';

const THUMBNAIL_URL = process.env.PUBLIC_THUMBNAIL_URL || 'https://bux-spades.pro/optimized/bux-spades.png';

const MAX_LEADER_ROWS = 5;
const THUMBNAIL_URL = process.env.PUBLIC_THUMBNAIL_URL || 'https://bux-spades.pro/optimized/bux-spades.png';

function formatCoinsShort(value) {
  if (!Number.isFinite(value)) {
    return '';
  }

  if (Math.abs(value) >= 1_000_000) {
    const millions = value / 1_000_000;
    const formatted = Number.isInteger(millions) ? millions.toString() : millions.toFixed(1).replace(/\.0$/, '');
    return `${formatted}mil`;
  }

  if (Math.abs(value) >= 1_000) {
    const thousands = value / 1_000;
    const formatted = Number.isInteger(thousands) ? thousands.toString() : thousands.toFixed(1).replace(/\.0$/, '');
    return `${formatted}k`;
  }

  return `${value}`;
}

function resolveBannerUrl(bannerUrl) {
  if (!bannerUrl) {
    return null;
  }
  if (bannerUrl.startsWith('http://') || bannerUrl.startsWith('https://')) {
    return bannerUrl;
  }
  const base = process.env.PUBLIC_ASSET_BASE_URL || process.env.PUBLIC_URL || '';
  if (!base) {
    return bannerUrl;
  }
  return `${base.replace(/\/$/, '')}/${bannerUrl.replace(/^\//, '')}`;
}

export class EventAnalyticsService {
  static async buildEventStartEmbed(event) {
    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${event.name} Has Started!`)
      .setColor(0xffd700)
      .setTimestamp(new Date(event.startsAt))
      .setThumbnail(THUMBNAIL_URL);

    const bannerUrl = resolveBannerUrl(event.bannerUrl);
    if (bannerUrl) {
      embed.setImage(bannerUrl);
    }

    embed.setThumbnail(THUMBNAIL_URL);

    const filterDescription = this.describeFilters(event.filters);
    embed.setDescription(
      [
        event.description || 'Join the games and climb the leaderboard!',
        '',
        `**Event Window:** <t:${Math.floor(new Date(event.startsAt).getTime() / 1000)}:F> - <t:${Math.floor(
          new Date(event.endsAt).getTime() / 1000,
        )}:F>`,
        filterDescription ? `\n${filterDescription}` : '',
      ].join('\n'),
    );

    if (event.criteria && event.criteria.length) {
      embed.addFields({
        name: '🎯 Prizes',
        value: event.criteria
          .map((criterion) => {
            const amount = `${formatCoinsShort(criterion.rewardCoins)} coins`;
            switch (criterion.type) {
              case 'MOST_WINS':
                return `• Most wins: **${amount}**`;
              case 'MOST_GAMES_PLAYED':
                return `• Most games played: **${amount}**`;
              case 'HIGHEST_WIN_PERCENT':
                return `• Highest win %: **${amount}**`;
              case 'GAMES_PLAYED_MILESTONE':
                return `• Every ${criterion.milestoneValue} games played: **${amount}**`;
              case 'GAMES_WON_MILESTONE':
                return `• Every ${criterion.milestoneValue} wins: **${amount}**`;
              default:
                return `• ${criterion.type}: **${amount}**`;
            }
          })
          .join('\n'),
      });
    }

    return embed;
  }

  static async buildEventProgressEmbed(event) {
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${event.name} — Live Standings`)
      .setColor(0x2b6cb0)
      .setTimestamp(new Date())
      .setThumbnail(THUMBNAIL_URL);

    const bannerUrl = resolveBannerUrl(event.bannerUrl);
    if (bannerUrl) {
      embed.setImage(bannerUrl);
    }

    const participants = event.participants || [];
    const eventGames = Array.isArray(event.EventGame) ? event.EventGame.filter((game) => game?.qualifies !== false) : [];
    const recordedGames = eventGames.length;
    const inferredGamesFromStats = participants.length
      ? Math.max(...participants.map((p) => p?.gamesPlayed || 0), 0)
      : 0;
    const totalGames = recordedGames || inferredGamesFromStats || 0;
    const uniquePlayers = participants.length;

    embed.setDescription(
      [
        `**Time Left:** <t:${Math.floor(new Date(event.endsAt).getTime() / 1000)}:R>`,
        `**Games Logged:** ${totalGames.toLocaleString()}`,
        `**Participants:** ${uniquePlayers}`,
      ].join('\n'),
    );

    embed.setThumbnail(THUMBNAIL_URL);

    const winLeaders = [...participants]
      .filter((p) => p.gamesWon > 0)
      .sort((a, b) => b.gamesWon - a.gamesWon)
      .slice(0, MAX_LEADER_ROWS);

    if (winLeaders.length) {
      embed.addFields({
        name: '🥇 Most Wins',
        value: await this.renderLeaderboard(winLeaders, 'gamesWon'),
      });
    }

    const playLeaders = [...participants]
      .filter((p) => p.gamesPlayed > 0)
      .sort((a, b) => b.gamesPlayed - a.gamesPlayed)
      .slice(0, MAX_LEADER_ROWS);

    if (playLeaders.length) {
      embed.addFields({
        name: '🎮 Most Games Played',
        value: await this.renderLeaderboard(playLeaders, 'gamesPlayed'),
      });
    }

    const winRateLeaders = [...participants]
      .filter((p) => p.gamesPlayed >= 3)
      .sort((a, b) => b.winPercent - a.winPercent)
      .slice(0, MAX_LEADER_ROWS);

    if (winRateLeaders.length) {
      embed.addFields({
        name: '📈 Highest Win % (3+ games)',
        value: await this.renderLeaderboard(winRateLeaders, 'winPercent'),
      });
    }

    return embed;
  }

  static async buildEventEndEmbed(event) {
    const embed = new EmbedBuilder()
      .setTitle(`🏁 ${event.name} — Results`)
      .setColor(0x38a169)
      .setTimestamp(new Date(event.endsAt))
      .setThumbnail(THUMBNAIL_URL);

    const bannerUrl = resolveBannerUrl(event.bannerUrl);
    if (bannerUrl) {
      embed.setImage(bannerUrl);
    }

    embed.setThumbnail(THUMBNAIL_URL);

    const participants = event.participants || [];
    const eventGames = Array.isArray(event.EventGame) ? event.EventGame.filter((game) => game?.qualifies !== false) : [];
    const recordedGames = eventGames.length;
    const inferredGamesFromStats = participants.length
      ? Math.max(...participants.map((p) => p?.gamesPlayed || 0), 0)
      : 0;
    const totalGames = recordedGames || inferredGamesFromStats || 0;
    const uniquePlayers = participants.length;

    embed.setDescription(
      [
        'Thanks to everyone who played!',
        '',
        `**Games Played:** ${totalGames.toLocaleString()}`,
        `**Participants:** ${uniquePlayers}`,
      ].join('\n'),
    );

    const fields = [];

    if (event.criteria && event.criteria.length) {
      for (const criterion of event.criteria) {
        const top = this.findTopParticipants(participants, criterion);
        if (!top.length) continue;

        const title = this.describeCriterion(criterion);
        const value = await this.renderLeaderboard(
          top,
          criterion.type === 'HIGHEST_WIN_PERCENT' ? 'winPercent' : 'gamesWon',
        );
        fields.push({ name: title, value });
      }
    }

    if (!fields.length) {
      const winners = [...participants]
        .filter((p) => p.gamesPlayed > 0)
        .sort((a, b) => b.gamesWon - a.gamesWon)
        .slice(0, MAX_LEADER_ROWS);
      fields.push({
        name: 'Top Performers',
        value: await this.renderLeaderboard(winners, 'gamesWon'),
      });
    }

    embed.addFields(fields);

    return embed;
  }

  static describeFilters(filters = {}) {
    const lines = [];

    const formats = EventFilterService.normalizeArray(filters.allowedFormats || filters.formats);
    if (formats.length) {
      lines.push(`• Formats: ${formats.join(', ')}`);
    }

    const modes = EventFilterService.normalizeArray(filters.allowedModes || filters.modes);
    if (modes.length) {
      lines.push(`• Modes: ${modes.join(', ')}`);
    }

    if (filters.coinRange) {
      const min = Number(filters.coinRange.min || 0).toLocaleString();
      const max = Number(filters.coinRange.max || 0).toLocaleString();
      lines.push(`• Buy-in range: ${min} - ${max}`);
    } else if (Array.isArray(filters.coins) && filters.coins.length) {
      lines.push(`• Buy-ins: ${filters.coins.map((value) => Number(value).toLocaleString()).join(', ')}`);
    }

    if (filters.pointsRange) {
      lines.push(`• Points: ${filters.pointsRange.min}/${filters.pointsRange.max}`);
    }

    const specials = [];
    const special1 = EventFilterService.normalizeArray(filters.allowedSpecialRule1 || filters.specialRule1);
    if (special1.length) specials.push(`Rule1: ${special1.join(', ')}`);
    const special2 = EventFilterService.normalizeArray(filters.allowedSpecialRule2 || filters.specialRule2);
    if (special2.length) specials.push(`Rule2: ${special2.join(', ')}`);
    if (specials.length) {
      lines.push(`• Special Rules: ${specials.join(' | ')}`);
    }

    if (filters.nilAllowed !== undefined) {
      lines.push(`• Nil bids: ${filters.nilAllowed ? 'Allowed' : 'Disallowed'}`);
    }

    if (filters.blindNilAllowed !== undefined) {
      lines.push(`• Blind Nil: ${filters.blindNilAllowed ? 'Allowed' : 'Disallowed'}`);
    }

    return lines.length ? lines.join('\n') : '';
  }

  static describeCriterion(criterion) {
    const amount = `${formatCoinsShort(criterion.rewardCoins)} coins`;
    switch (criterion.type) {
      case 'MOST_WINS':
        return `🥇 Most Wins — ${amount}`;
      case 'MOST_GAMES_PLAYED':
        return `🎮 Most Games Played — ${amount}`;
      case 'HIGHEST_WIN_PERCENT':
        return `📈 Highest Win % — ${amount}`;
      case 'GAMES_PLAYED_MILESTONE':
        return `🎯 Every ${criterion.milestoneValue} Games — ${amount}`;
      case 'GAMES_WON_MILESTONE':
        return `🏅 Every ${criterion.milestoneValue} Wins — ${amount}`;
      default:
        return `${criterion.type} — ${amount}`;
    }
  }

  static findTopParticipants(participants, criterion) {
    switch (criterion.type) {
      case 'MOST_GAMES_PLAYED':
        return [...participants].sort((a, b) => b.gamesPlayed - a.gamesPlayed).slice(0, MAX_LEADER_ROWS);
      case 'HIGHEST_WIN_PERCENT':
        return [...participants]
          .filter((p) => p.gamesPlayed >= (criterion.config?.minGames || 3))
          .sort((a, b) => b.winPercent - a.winPercent)
          .slice(0, MAX_LEADER_ROWS);
      case 'GAMES_PLAYED_MILESTONE':
        return participants.filter((p) => p.gamesPlayed >= (criterion.milestoneValue || 1));
      case 'GAMES_WON_MILESTONE':
        return participants.filter((p) => p.gamesWon >= (criterion.milestoneValue || 1));
      case 'MOST_WINS':
      default:
        return [...participants].sort((a, b) => b.gamesWon - a.gamesWon).slice(0, MAX_LEADER_ROWS);
    }
  }

  static async renderLeaderboard(entries, metric) {
    if (!entries.length) {
      return '_No data yet_';
    }

    const userIds = entries.map((entry) => entry.userId);
    const users = await EventService.listEventParticipantsUsers(userIds);
    const userMap = new Map(users.map((user) => [user.id, user]));

    return entries
      .map((entry, index) => {
        const rank = index + 1;
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
        const user = userMap.get(entry.userId);
        const username = user?.username || `User ${entry.userId.slice(0, 6)}`;

        let value = '';
        switch (metric) {
          case 'gamesPlayed':
            value = `${entry.gamesPlayed} games`;
            break;
          case 'winPercent':
            value = `${entry.winPercent.toFixed(1)}% (${entry.gamesWon}/${entry.gamesPlayed})`;
            break;
          default:
            value = `${entry.gamesWon} wins`;
        }

        return `${medal} **${username}** — ${value}`;
      })
      .join('\n');
  }
}

export default EventAnalyticsService;

