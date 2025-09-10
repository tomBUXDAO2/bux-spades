import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { useSocket } from './SocketContext';

// Configure axios defaults
axios.defaults.baseURL = import.meta.env.PROD
  ? import.meta.env.VITE_PROD_API_URL
  : import.meta.env.VITE_API_URL;
axios.defaults.withCredentials = true;

// Add request/response interceptors for debugging
axios.interceptors.request.use(
  (config) => {
    console.log('Making request:', {
      url: config.url,
      method: config.method,
      headers: config.headers,
      data: config.data
    });
    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

axios.interceptors.response.use(
  (response) => {
    console.log('Received response:', {
      status: response.status,
      data: response.data,
      headers: response.headers
    });
    return response;
  },
  (error) => {
    console.error('Response error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    return Promise.reject(error);
  }
);

interface User {
  id: string;
  username: string;
  email: string;
  avatar: string | null;
  coins: number;
  isAuthenticated?: boolean;
  stats?: {
    gamesPlayed: number;
    gamesWon: number;
    nilsBid: number;
    nilsMade: number;
    blindNilsBid: number;
    blindNilsMade: number;
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  setUser: (user: User | null) => void;
  login: (username: string, password: string) => Promise<{ activeGame?: { id: string; status: string } }>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateProfile: (username: string, avatar: string) => Promise<void>;
  showSessionInvalidatedModal: boolean;
  setShowSessionInvalidatedModal: (show: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSessionInvalidatedModal, setShowSessionInvalidatedModal] = useState(false);
  const { socket } = useSocket();

  useEffect(() => {
    const token = localStorage.getItem('sessionToken');
    if (token) {
      fetchProfile();
    } else {
      setLoading(false);
    }
  }, []);

  // Listen for session invalidation events
  useEffect(() => {
    const handleSessionInvalidated = (event: CustomEvent) => {
      console.log('Session invalidated event received:', event.detail);
      setShowSessionInvalidatedModal(true);
      // Clear user data
      setUser(null);
      localStorage.removeItem('sessionToken');
      localStorage.removeItem('userData');
    };

    window.addEventListener('sessionInvalidated', handleSessionInvalidated as EventListener);
    
    return () => {
      window.removeEventListener('sessionInvalidated', handleSessionInvalidated as EventListener);
    };
  }, []);

  // Listen for real-time coin updates
  useEffect(() => {
    if (!socket || !user) return;

    const handleCoinUpdate = (data: { userId: string; newBalance: number }) => {
      console.log('Coin update received:', data);
      if (data.userId === user.id) {
        setUser(prev => prev ? { ...prev, coins: data.newBalance } : null);
        console.log('Updated user coin balance to:', data.newBalance);
      }
    };

    socket.on('coin_updated', handleCoinUpdate);
    
    return () => {
      socket.off('coin_updated', handleCoinUpdate);
    };
  }, [socket, user]);

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem('sessionToken');
      if (!token) {
        setLoading(false);
        return;
      }

      console.log('Fetching profile with token:', token);
      const response = await axios.get('/api/auth/profile', {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
      });
      
      if (response.data?.user) {
        const userData = {
          ...response.data.user,
          sessionToken: token
        };
        setUser(userData);
        
        // Try to store user data in localStorage, but handle quota exceeded error
        try {
          localStorage.setItem('userData', JSON.stringify(userData));
        } catch (storageError) {
          console.warn('Failed to store user data in localStorage (quota exceeded):', storageError);
          // Clear some old data and try again
          try {
            localStorage.clear();
            localStorage.setItem('userData', JSON.stringify(userData));
            localStorage.setItem('sessionToken', token);
          } catch (retryError) {
            console.error('Failed to store user data even after clearing localStorage:', retryError);
            // Continue without storing - the user is still logged in via sessionToken
          }
        }
      } else {
        console.error('Invalid profile response:', response.data);
        localStorage.removeItem('sessionToken');
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      localStorage.removeItem('sessionToken');
    } finally {
      setLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    try {
      setError(null);
      console.log('Attempting login with:', { username });
      const response = await axios.post(
        '/api/auth/login',
        { username, password },
        {
          withCredentials: true
        }
      );

      if (response.data?.user && response.data?.token) {
        console.log('Login successful:', response.data);
        const userData = {
          ...response.data.user,
          isAuthenticated: true
        };
        setUser(userData);
        
        // Store the JWT token
        localStorage.setItem('sessionToken', response.data.token);
        
        // Try to store user data in localStorage, but handle quota exceeded error
        try {
          localStorage.setItem('userData', JSON.stringify(userData));
        } catch (storageError) {
          console.warn('Failed to store user data in localStorage (quota exceeded):', storageError);
          // Clear some old data and try again
          try {
            localStorage.clear();
            localStorage.setItem('userData', JSON.stringify(userData));
            localStorage.setItem('sessionToken', response.data.token);
          } catch (retryError) {
            console.error('Failed to store user data even after clearing localStorage:', retryError);
            // Continue without storing - the user is still logged in via session
          }
        }

        return { activeGame: response.data.activeGame };
      } else {
        throw new Error('Invalid login response');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Login failed';
      setError(errorMessage);
      throw error;
    }
  };

  const register = async (username: string, email: string, password: string) => {
    try {
      setError(null);
      console.log('Attempting registration with:', { username, email });
      const response = await axios.post(
        '/api/auth/register',
        { username, email, password },
        {
          withCredentials: true
        }
      );

      if (response.data?.message) {
        console.log('Registration successful:', response.data);
        // Registration successful, but user needs to login
        // Don't automatically log them in - they should login after registration
      } else {
        console.error('Invalid registration response:', response.data);
        throw new Error('Invalid response from server');
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Registration failed. Please try again.';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const logout = async () => {
    try {
      // Call server logout endpoint to clear session
      await axios.post('/api/auth/logout', {}, { withCredentials: true });
    } catch (error) {
      console.error('Error during logout:', error);
    } finally {
      // Clear local data regardless of server response
      localStorage.removeItem('userData');
      localStorage.removeItem('sessionToken');
      sessionStorage.removeItem('userData');
      setUser(null);
    }
  };

  const updateProfile = async (username: string, avatar: string) => {
    try {
      setError(null);

      console.log('Attempting profile update:', { username, avatar });
      const response = await axios.put(
        '/api/auth/profile',
        { username, avatar },
        {
          withCredentials: true
        }
      );

      if (response.data?.user) {
        console.log('Profile update successful:', response.data);
        const userData = {
          ...response.data.user,
          isAuthenticated: true
        };
        setUser(userData);
        
        // Try to store user data in localStorage, but handle quota exceeded error
        try {
          localStorage.setItem('userData', JSON.stringify(userData));
        } catch (storageError) {
          console.warn('Failed to store user data in localStorage (quota exceeded):', storageError);
          // Clear some old data and try again
          try {
            localStorage.clear();
            localStorage.setItem('userData', JSON.stringify(userData));
          } catch (retryError) {
            console.error('Failed to store user data even after clearing localStorage:', retryError);
            // Continue without storing - the user is still logged in via session
          }
        }
      } else {
        console.error('Invalid profile update response:', response.data);
        throw new Error('Invalid response from server');
      }
    } catch (error: any) {
      console.error('Profile update error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Profile update failed. Please try again.';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        setUser,
        login,
        register,
        logout,
        updateProfile,
        showSessionInvalidatedModal,
        setShowSessionInvalidatedModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 