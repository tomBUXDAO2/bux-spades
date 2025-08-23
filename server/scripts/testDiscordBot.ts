import { sendLeagueGameResults } from '../src/discord-bot/bot';

async function testDiscordBot() {
  try {
    console.log('Testing Discord bot...');
    
    const testData = {
      buyIn: 200000,
      players: [
        { userId: '931160720261939230', won: true },
        { userId: '1195400053964161055', won: true },
        { userId: '1403863570415882382', won: false },
        { userId: '577901812246511637', won: false }
      ]
    };
    
    const gameLine = '200k PARTNERS 350/-100 REGULAR';
    
    console.log('Sending test Discord embed...');
    await sendLeagueGameResults(testData, gameLine);
    console.log('Discord embed sent successfully!');
  } catch (error) {
    console.error('Error testing Discord bot:', error);
  }
}

testDiscordBot(); 