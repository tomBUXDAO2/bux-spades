const fetch = require('node-fetch');

const WILL_DISCORD_ID = '1400546525951824024';
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

async function checkWillConnections() {
  console.log(`\n🔍 Checking connections for Will2828 (${WILL_DISCORD_ID})...`);
  console.log(`Time: ${new Date().toISOString()}`);
  
  try {
    // First, we need to get an access token for Will's account
    // Since we can't directly access user connections without their authorization,
    // we'll simulate what happens in the OAuth flow
    
    console.log('⚠️  Note: Discord API requires user authorization to access connections');
    console.log('   This script can only check what our OAuth flow would return');
    console.log('   The issue is that Discord API is not returning connections for Will2828');
    
    // Let's check if we can at least get user info
    const userResponse = await fetch(`https://discord.com/api/v10/users/${WILL_DISCORD_ID}`, {
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (userResponse.ok) {
      const userData = await userResponse.json();
      console.log('✅ User info retrieved:');
      console.log(`   Username: ${userData.username}`);
      console.log(`   Global Name: ${userData.global_name}`);
      console.log(`   ID: ${userData.id}`);
    } else {
      console.log('❌ Failed to get user info:', userResponse.status, userResponse.statusText);
    }
    
    console.log('\n📋 Next steps:');
    console.log('1. Will2828 needs to try the Facebook verification button again');
    console.log('2. The system will now ALWAYS assign the role if he reaches the OAuth callback');
    console.log('3. This bypasses Discord API connection issues');
    
  } catch (error) {
    console.error('❌ Error checking connections:', error.message);
  }
}

// Run the check
checkWillConnections(); 