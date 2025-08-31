const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

const RESULTS_CHANNEL_ID = process.env.RESULTS_CHANNEL_ID || '1404128066296610878';

async function postGameEmbed() {
  try {
    console.log('Logging into Discord...');
    await client.login(process.env.DISCORD_BOT_TOKEN);
    
    console.log('Getting results channel...');
    const channel = await client.channels.fetch(RESULTS_CHANNEL_ID);
    
    if (!channel) {
      console.error('Results channel not found');
      return;
    }
    
    // Create the embed for the specific game
    const embed = new EmbedBuilder()
      .setTitle('🏆 League Game Results')
      .setDescription('**200k PARTNERS 300/-150 WHIZ**')
      .setThumbnail('https://www.bux-spades.pro/bux-spades.png')
      .addFields(
        { name: '🥇 Winners', value: '<@1407801873213292726>, <@931160720261939230>', inline: true },
        { name: '💰 Coins Won', value: '360k each', inline: true },
        { name: '🥈 Losers', value: '<@1195400053964161055>, <@cme8sw3zz000614p8mp1mzbag>', inline: true }
      )
      .setColor(0x00ff00)
      .setTimestamp();
    
    console.log('Posting embed...');
    await channel.send({ embeds: [embed] });
    
    console.log('Discord embed posted successfully!');
    
  } catch (error) {
    console.error('Error posting Discord embed:', error);
  } finally {
    await client.destroy();
  }
}

postGameEmbed(); 