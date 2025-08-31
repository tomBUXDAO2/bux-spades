const fetch = require('node-fetch');

// Debug script to test Facebook verification OAuth2 flow
async function debugFacebookVerification() {
  console.log('🔍 Debugging Facebook Verification OAuth2 Flow');
  console.log('==============================================');
  
  // Check environment variables
  console.log('\n📋 Environment Variables Check:');
  console.log(`DISCORD_CLIENT_ID: ${process.env.DISCORD_CLIENT_ID ? '✅ Set' : '❌ Missing'}`);
  console.log(`DISCORD_CLIENT_SECRET: ${process.env.DISCORD_CLIENT_SECRET ? '✅ Set' : '❌ Missing'}`);
  console.log(`CLIENT_URL: ${process.env.CLIENT_URL || '❌ Missing'}`);
  
  if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
    console.log('\n❌ Missing required environment variables!');
    return;
  }
  
  // Test OAuth2 URL generation
  console.log('\n🔗 OAuth2 URL Test:');
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = `${process.env.SERVER_URL || 'https://bux-spades-server.fly.dev'}/api/auth/connections/callback`;
  const scope = 'connections identify';
  
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}`;
  
  console.log(`Generated Auth URL: ${authUrl}`);
  console.log(`Redirect URI: ${redirectUri}`);
  console.log(`Scope: ${scope}`);
  
  // Test Discord API connectivity
  console.log('\n🌐 Discord API Connectivity Test:');
  try {
    const response = await fetch('https://discord.com/api/v10/applications/@me', {
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const appData = await response.json();
      console.log('✅ Discord API connectivity: OK');
      console.log(`Application Name: ${appData.name}`);
      console.log(`Application ID: ${appData.id}`);
    } else {
      console.log(`❌ Discord API connectivity failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`❌ Discord API connectivity error: ${error.message}`);
  }
  
  console.log('\n📝 Troubleshooting Steps:');
  console.log('1. Verify Discord Application OAuth2 settings:');
  console.log('   - Go to https://discord.com/developers/applications');
  console.log('   - Select your application');
  console.log('   - Go to OAuth2 > General');
  console.log('   - Check that the redirect URI matches exactly:');
  console.log(`     ${redirectUri}`);
  console.log('   - Ensure "connections" scope is enabled');
  console.log('   - Ensure "identify" scope is enabled');
  
  console.log('\n2. Check environment variables on your deployment:');
  console.log('   - Verify DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET are set correctly');
  console.log('   - Verify CLIENT_URL is set to your production URL');
  
  console.log('\n3. Test the flow manually:');
  console.log('   - Visit the generated auth URL above');
  console.log('   - Complete the OAuth2 flow');
  console.log('   - Check server logs for detailed error messages');
}

debugFacebookVerification(); 