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
      .setTitle('🎮 Game Results')
      .setColor('#00ff00')
      .setDescription('**100k Partners 200/-150 Regular**')
      .addFields(
        { name: '🔴 Red Team', value: '@Tom [BUX$DAO]\n@GEM', inline: true },
        { name: '🔵 Blue Team', value: '@Nichole\n@Anita', inline: true },
        { name: '🏆 Winner', value: 'Red Team', inline: false },
        { name: '📊 Final Score', value: 'Red: 200 | Blue: 150', inline: false }
      )
      .setTimestamp()
      .setFooter({ text: 'BUX Spades - Game Completed' });
    
    console.log('Sending embed...');
    await channel.send({ embeds: [embed] });
    console.log('✅ Discord embed sent successfully!');
    
  } catch (error) {
    console.error('❌ Error posting Discord embed:', error);
  } finally {
    await client.destroy();
  }
}

postGameEmbed(); 