import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

// Configure axios defaults
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
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateProfile: (username: string, avatar: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchProfile();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      console.log('Fetching profile with token:', token);
      const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/auth/profile`, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
      });
      
      if (response.data?.user) {
        setUser(response.data.user);
      } else {
        console.error('Invalid profile response:', response.data);
        localStorage.removeItem('token');
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setError(null);
      console.log('Attempting login with:', { email });
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/auth/login`,
        { email, password },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data?.token && response.data?.user) {
        console.log('Login successful:', response.data);
        localStorage.setItem('token', response.data.token);
        setUser(response.data.user);
      } else {
        console.error('Invalid login response:', response.data);
        throw new Error('Invalid response from server');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Login failed. Please check your credentials and try again.';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const register = async (username: string, email: string, password: string) => {
    try {
      setError(null);
      console.log('Attempting registration with:', { username, email });
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/auth/register`,
        { username, email, password },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data?.token && response.data?.user) {
        console.log('Registration successful:', response.data);
        localStorage.setItem('token', response.data.token);
        setUser(response.data.user);
      } else {
        console.error('Invalid registration response:', response.data);
        throw new Error('Invalid response from server');
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Registration failed. Please try again.';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const updateProfile = async (username: string, avatar: string) => {
    try {
      setError(null);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      console.log('Attempting profile update:', { username, avatar });
      const response = await axios.put(
        `${import.meta.env.VITE_API_URL}/api/auth/profile`,
        { username, avatar },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data?.user) {
        console.log('Profile update successful:', response.data);
        setUser(response.data.user);
      } else {
        console.error('Invalid profile update response:', response.data);
        throw new Error('Invalid response from server');
      }
    } catch (error: any) {
      console.error('Profile update error:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Profile update failed. Please try again.';
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