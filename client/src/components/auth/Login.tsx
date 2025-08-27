import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted', { username, email, isRegistering });
    setError(null);
    setIsLoading(true);
    
    try {
      if (isRegistering) {
        console.log('Attempting to register...');
        await register(username, email, password);
        console.log('Registration successful');
        navigate('/');
      } else {
        console.log('Attempting to login...');
        const result = await login(username, password);
        console.log('Login successful, result:', result);
        
        // Check if user has an active game
        if (result.activeGame) {
          console.log('User has active game, redirecting to game table:', result.activeGame);
          navigate(`/table/${result.activeGame.id}`);
        } else {
          console.log('No active game, redirecting to lobby');
          navigate('/');
        }
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      setError(error.message || (isRegistering ? 'Registration failed' : 'Login failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiscordLogin = () => {
    const apiUrl = import.meta.env.PROD
      ? "https://bux-spades-server.fly.dev"
      : "http://localhost:3000"; // Always use backend port in dev
    window.location.href = `${apiUrl}/api/auth/discord`;
  };

  const toggleMode = () => {
    setIsRegistering(!isRegistering);
    setError(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="flex flex-col items-center">
          <div className="flex items-center space-x-4">
            <img 
              src="/optimized/bux-spades.png" 
              alt="BUX"
              className="h-24 w-auto" 
            />
            <span className="text-6xl font-bold text-slate-200">Spades</span>
          </div>
        </div>
        <form className="mt-12 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            {isRegistering && (
              <div>
                <label htmlFor="username" className="sr-only">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  className="input rounded-t-md rounded-b-none"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            )}
            {!isRegistering && (
              <div>
                <label htmlFor="username" className="sr-only">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  className="input rounded-t-md rounded-b-none"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            )}
            {isRegistering && (
              <div>
                <label htmlFor="email-address" className="sr-only">
                  Email address
                </label>
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  required
                  className="input rounded-b-none"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            )}
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className={`input ${isRegistering ? 'rounded-b-none' : 'rounded-b-md'}`}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center">{error}</div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {isLoading ? (
                <span>Loading...</span>
              ) : (
                <span>{isRegistering ? 'Register' : 'Sign in'}</span>
              )}
            </button>
          </div>

          <div>
            <button
              type="button"
              onClick={handleDiscordLogin}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-[#5865F2] hover:bg-[#4752C4] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#5865F2]"
            >
              <span>Continue with Discord</span>
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={toggleMode}
              className="text-indigo-400 hover:text-indigo-300"
            >
              {isRegistering ? 'Already have an account? Sign in' : "Don't have an account? Register"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login; 