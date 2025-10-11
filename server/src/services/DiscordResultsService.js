import { EmbedBuilder } from 'discord.js';
import { client } from '../discord/bot.js';
import { prisma } from '../config/database.js';

export class DiscordResultsService {
  
  /**
   * Post game result embed to Discord results channel
   * Only posts for league games (isLeague: true)
   * @param {string} gameId - The game ID
   */
  static async postGameResult(gameId) {
    try {
      // Get game details with players and result
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          players: {
            include: {
              user: true
            }
          },
          result: true
        }
      });

      if (!game) {
        console.error(`[DISCORD RESULTS] Game ${gameId} not found`);
        return;
      }

      // Only post results for league games
      if (!game.isLeague) {
        console.log(`[DISCORD RESULTS] Skipping non-league game ${gameId}`);
        return;
      }

      if (!game.result) {
        console.error(`[DISCORD RESULTS] No result found for game ${gameId}`);
        return;
      }

      console.log(`[DISCORD RESULTS] Posting results for league game ${gameId}`);

      // Create embed based on game mode
      let embed;
      if (game.mode === 'PARTNERS') {
        embed = await this.createPartnersEmbed(game);
      } else {
        embed = await this.createSoloEmbed(game);
      }

      // Post to results channel
      const resultsChannelId = '1404128066296610878';
      const channel = await client.channels.fetch(resultsChannelId);
      
      if (!channel) {
        console.error(`[DISCORD RESULTS] Results channel ${resultsChannelId} not found`);
        return;
      }

      await channel.send({
        content: '<@&1403953667501195284>',
        embeds: [embed]
      });

      console.log(`[DISCORD RESULTS] Successfully posted results for game ${gameId}`);
    } catch (error) {
      console.error(`[DISCORD RESULTS] Error posting results for game ${gameId}:`, error);
    }
  }

  /**
   * Create partners game result embed
   */
  static async createPartnersEmbed(game) {
    const { result } = game;
    
    // Get team assignments and scores
    const team0Players = game.players.filter(p => p.teamIndex === 0);
    const team1Players = game.players.filter(p => p.teamIndex === 1);
    
    const team0Score = result.team0Final || 0;
    const team1Score = result.team1Final || 0;
    
    const isTeam0Winner = team0Score > team1Score;
    const winnerTeam = isTeam0Winner ? team0Players : team1Players;
    const loserTeam = isTeam0Winner ? team1Players : team0Players;
    const winnerScore = isTeam0Winner ? team0Score : team1Score;
    const loserScore = isTeam0Winner ? team1Score : team0Score;

    // Format game info
    const coins = game.buyIn || 0;
    const coinText = coins >= 1000000 ? `${coins / 1000000}mil` : `${coins / 1000}k`;
    const maxPoints = game.maxPoints || 0;
    const minPoints = game.minPoints || 0;
    const nilAllowed = game.nilAllowed ? '☑️' : '❌';
    const blindNilAllowed = game.blindNilAllowed ? '☑️' : '❌';

    // Calculate coin winnings (winners get 1.8x buy-in each, losers lose buy-in)
    const winnerCoins = Math.floor(coins * 1.8);
    const loserCoins = coins;

    const embed = new EmbedBuilder()
      .setTitle('🏆 League Game Results')
      .setDescription(
        `${coinText} PARTNERS ${maxPoints}/${minPoints} REG nil ${nilAllowed} bn ${blindNilAllowed}\n\n` +
        `🥇 Winners\n` +
        `${winnerTeam.map(p => `<@${p.user.discordId}>`).join(', ')} - ${winnerScore}\n\n` +
        `💰 Coins Won\n${winnerCoins.toLocaleString()}k each\n\n` +
        `🥈 Losers\n` +
        `${loserTeam.map(p => `<@${p.user.discordId}>`).join(', ')} - ${loserScore}`
      )
      .setColor(0xffd700)
      .setThumbnail('https://cdn.discordapp.com/emojis/@bux-spades.png')
      .setTimestamp();

    return embed;
  }

  /**
   * Create solo game result embed
   */
  static async createSoloEmbed(game) {
    const { result } = game;
    
    // Get individual player scores
    const playerScores = [
      { player: game.players.find(p => p.seatIndex === 0), score: result.player0Final || 0 },
      { player: game.players.find(p => p.seatIndex === 1), score: result.player1Final || 0 },
      { player: game.players.find(p => p.seatIndex === 2), score: result.player2Final || 0 },
      { player: game.players.find(p => p.seatIndex === 3), score: result.player3Final || 0 }
    ].filter(p => p.player); // Remove null players

    // Sort by score (highest first)
    playerScores.sort((a, b) => b.score - a.score);

    // Format game info
    const coins = game.buyIn || 0;
    const coinText = coins >= 1000000 ? `${coins / 1000000}mil` : `${coins / 1000}k`;
    const maxPoints = game.maxPoints || 0;
    const minPoints = game.minPoints || 0;
    const nilAllowed = game.nilAllowed ? '☑️' : '❌';
    const blindNilAllowed = game.blindNilAllowed ? '☑️' : '❌';

    // Calculate coin distribution (1st: 2.6x, 2nd: 1x, 3rd/4th: 0.2x each)
    const firstCoins = Math.floor(coins * 2.6);
    const secondCoins = coins;
    const thirdFourthCoins = Math.floor(coins * 0.2);

    const winner = playerScores[0];
    const runnerUp = playerScores[1];
    const losers = playerScores.slice(2);

    const embed = new EmbedBuilder()
      .setTitle('🏆 League Game Results')
      .setDescription(
        `${coinText} SOLO ${maxPoints}/${minPoints} REG nil ${nilAllowed} bn ${blindNilAllowed}\n\n` +
        `🥇 Winner\n` +
        `<@${winner.player.user.discordId}> - ${winner.score}\n\n` +
        `💰 Coins Won\n1st: ${firstCoins.toLocaleString()}k\n\n` +
        `🥈 Runner up\n` +
        `<@${runnerUp.player.user.discordId}> - ${runnerUp.score}\n\n` +
        `💰 Coins Won\n2nd: ${secondCoins.toLocaleString()}k\n\n` +
        `Losers\n` +
        `${losers.map(p => `<@${p.player.user.discordId}>`).join(', ')}`
      )
      .setColor(0xffd700)
      .setThumbnail('https://cdn.discordapp.com/emojis/@bux-spades.png')
      .setTimestamp();

    return embed;
  }
}
