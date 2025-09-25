import { EmbedBuilder, TextChannel } from 'discord.js';
import { formatCoins } from '../utils';
import { GUILD_ID, RESULTS_CHANNEL_ID } from '../constants';

/**
 * Send league game results to Discord
 */
export async function sendLeagueGameResults(client: any, gameData: any, gameLine: string): Promise<void> {
  console.log('[DISCORD BOT] sendLeagueGameResults called with data:', gameData);
  console.log('[DISCORD BOT] Game line:', gameLine);
  
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = await guild.channels.fetch(RESULTS_CHANNEL_ID) as TextChannel;
    
    if (!channel) {
      console.error('Results channel not found');
      return;
    }
    
    // Use Discord IDs directly for mentions
    const winnersRaw = gameData.players.filter((p: any) => p.won);
    const losersRaw = gameData.players.filter((p: any) => !p.won);
    const winners = winnersRaw.map((p: any) => `<@${p.userId}>`);
    const losers = losersRaw.map((p: any) => `<@${p.userId}>`);
    
    // Calculate coins won with 10% rake
    // Partners: each winner gets 1.8x buy-in
    // Solo: 1st gets 2.6x buy-in, 2nd gets 1x buy-in
    const buyIn = gameData.buyIn || 0;
    let coinsField = '';
    if (winnersRaw.length === 2) {
      const perWinner = Math.round(buyIn * 1.8);
      coinsField = `${formatCoins(perWinner)} each`;
    } else if (winnersRaw.length === 1) {
      const first = Math.round(buyIn * 2.6);
      const second = Math.round(buyIn * 1.0);
      coinsField = `1st: ${formatCoins(first)} | 2nd: ${formatCoins(second)}`;
    } else {
      const totalPot = buyIn * gameData.players.length;
      const rake = Math.floor(totalPot * 0.1);
      const prizePool = totalPot - rake;
      coinsField = `${formatCoins(prizePool)}`;
    }
    
    const resultsEmbed = new EmbedBuilder()
      .setTitle('🏆 League Game Results')
      .setDescription(`<@&1403953667501195284>

**${gameLine}**`)
      .setThumbnail('https://www.bux-spades.pro/bux-spades.png')
      .addFields(
        { name: '🥇 Winners', value: winners.join(', '), inline: true },
        { name: '💰 Coins Won', value: coinsField, inline: true },
        { name: '🥈 Losers', value: losers.join(', '), inline: true }
      )
      .setColor(0x00ff00)
      .setTimestamp();

    // Add final scores - show individual player scores for solo games
    if (gameData.mode === 'SOLO' && gameData.playerScores && gameData.players) {
      // Create array of players with their scores and usernames
      const playersWithScores = gameData.playerScores.map((score: number, index: number) => ({
        score,
        seatIndex: index,
        username: gameData.players[index]?.username || `Player ${index + 1}`
      }));
      
      // Sort by score (highest first)
      playersWithScores.sort((a: any, b: any) => b.score - a.score);
      
      // Format as "Player: Score" in descending order
      const scoreText = playersWithScores.map((p: any) => `${p.username}: ${p.score}`).join(' | ');
      resultsEmbed.addFields(
        { name: '📊 Final Score', value: scoreText, inline: false }
      );
    } else if (gameData.team1Score !== undefined && gameData.team2Score !== undefined) {
      resultsEmbed.addFields(
        { name: '📊 Final Score', value: `Team 1: ${gameData.team1Score} | Team 2: ${gameData.team2Score}`, inline: false }
      );
    }    
    await channel.send({ embeds: [resultsEmbed] });
    console.log('Sent league game results to Discord');
  } catch (error) {
    console.error('Error sending league game results:', error);
  }
}
