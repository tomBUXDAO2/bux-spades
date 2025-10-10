import React, { useState } from 'react';

const Login: React.FC = () => {
  const [isLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discordError, setDiscordError] = useState(false);

  const handleDiscordLogin = () => {
    setDiscordError(false);
    
    // Get the server URL for the callback
    const serverUrl = import.meta.env.PROD
      ? "https://bux-spades-server.fly.dev"
      : "http://localhost:3000";
    
    // Construct the Discord OAuth URL with client ID
    const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
    const redirectUri = encodeURIComponent(`${serverUrl}/api/discord/callback`);
    const scope = encodeURIComponent('identify email');
    
    if (!clientId) {
      setError('Discord client ID not configured');
      return;
    }
    
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
    
    // Add error handling for the redirect
    try {
      // Add a timeout to detect if Discord OAuth is failing
      const timeout = setTimeout(() => {
        setDiscordError(true);
      }, 10000); // 10 second timeout
      
      window.location.href = discordAuthUrl;
      
      // Clear timeout if page changes (successful redirect)
      window.addEventListener('beforeunload', () => clearTimeout(timeout));
    } catch (error) {
      console.error('Discord login redirect failed:', error);
      setError('Failed to redirect to Discord login. Please try again.');
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-slate-900 py-12 px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex items-center justify-center space-x-4">
            <img 
              className="h-16 w-auto" 
              src="/bux-spades.png" 
              alt="BUX Spades Logo" 
            />
            <h1 className="text-4xl font-bold text-slate-200">
              BUX Spades
            </h1>
          </div>
        </div>

        <div className="text-center space-y-4">
          <p className="text-slate-300 text-lg">
            Players need a Discord account to login to BUX Spades
          </p>
          <p className="text-slate-400 text-sm">
            Those wanting to play <span className="font-semibold text-blue-400">LEAGUE games</span> must link their Discord profile to a legitimate Facebook account
          </p>
        </div>
        
        {error && (
          <div className="rounded-md bg-red-900/50 p-4">
            <div className="text-sm text-red-200">{error}</div>
          </div>
        )}

        <div className="mt-8">
          <button
            type="button"
            onClick={handleDiscordLogin}
            disabled={isLoading}
            className="w-full inline-flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            {discordError ? 'Discord login failed - try again' : 'Continue with Discord'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
