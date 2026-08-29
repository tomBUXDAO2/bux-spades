import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useUserState } from './hooks/useUserState';
import { useAuthMethods } from './hooks/useAuthMethods';
import { useProfileManagement } from './hooks/useProfileManagement';
import { AUTH_BROADCAST_CHANNEL, OAUTH_DEVICE_ID_KEY } from '../utils/displayMode';
import { api } from '@/services/lib/api';

interface User {
  id: string;
  username: string;
  email: string;
  avatar: string | null;
  avatarUrl?: string; // Support both avatar and avatarUrl properties
  discordId?: string; // Discord ID for admin authentication
  facebookId?: string | null;
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
  updateProfile: (username: string, avatarUrl: string) => Promise<void>;
  updateSoundPreference: (soundEnabled: boolean) => void;
  showSessionInvalidatedModal: boolean;
  setShowSessionInvalidatedModal: (show: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    user,
    setUser,
    loading,
    setLoading,
    error,
    setError,
    showSessionInvalidatedModal,
    setShowSessionInvalidatedModal
  } = useUserState();

  const { fetchProfile, login, register, logout } = useAuthMethods({
    setUser,
    setError,
    setLoading
  });

  const { updateProfile, updateSoundPreference } = useProfileManagement({
    user,
    setUser,
    setError
  });

  // Initialize auth state
  useEffect(() => {
    const token = localStorage.getItem('sessionToken');
    if (token) {
      // First try to load user data from localStorage for immediate display
      try {
        const userData = localStorage.getItem('userData');
        if (userData) {
          const parsedUserData = JSON.parse(userData);
          // Handle both nested and flat user data structures
          const user = parsedUserData.user ? parsedUserData.user : parsedUserData;
          if (user && user.id) {
            setUser(user);
          }
        }
      } catch (error) {
        console.warn('Failed to load user data from localStorage:', error);
      }
      
      // Then fetch fresh data from API
      fetchProfile();
    } else {
      setLoading(false);
    }
  }, [fetchProfile, setLoading, setUser]);

  // Rehydrate when OAuth finishes in another same-origin context (browser tab ↔ PWA)
  useEffect(() => {
    const applyToken = (token: string, userData?: unknown) => {
      try {
        localStorage.setItem('sessionToken', token);
        if (userData) {
          localStorage.setItem('userData', JSON.stringify(userData));
        }
      } catch {
        /* ignore quota */
      }
      fetchProfile();
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'sessionToken' && e.newValue) {
        fetchProfile();
      }
    };

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const token = localStorage.getItem('sessionToken');
      if (token) fetchProfile();
    };

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
      bc.onmessage = (ev) => {
        if (ev?.data?.type === 'session' && typeof ev.data.token === 'string') {
          applyToken(ev.data.token, ev.data.userData);
        }
      };
    } catch {
      /* unsupported */
    }

    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      try {
        bc?.close();
      } catch {
        /* ignore */
      }
    };
  }, [fetchProfile]);

  // OAuth handoff: claim JWT whenever a device id is pending (Android PWA must stay alive via window.open)
  const claimingRef = useRef(false);
  useEffect(() => {
    const claimHandoff = async () => {
      if (claimingRef.current) return;
      if (localStorage.getItem('sessionToken')) return;
      const deviceId = localStorage.getItem(OAUTH_DEVICE_ID_KEY);
      if (!deviceId) return;

      claimingRef.current = true;
      try {
        const res = await api.get(`/api/auth/handoff/claim?deviceId=${encodeURIComponent(deviceId)}`);
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (!data?.token) return;
        localStorage.setItem('sessionToken', data.token);
        localStorage.removeItem(OAUTH_DEVICE_ID_KEY);
        await fetchProfile();
        try {
          const url = new URL(window.location.href);
          if (url.searchParams.has('signin')) {
            url.searchParams.delete('signin');
            window.history.replaceState({}, '', url.pathname + url.search + url.hash);
          }
        } catch {
          /* ignore */
        }
      } catch (err) {
        console.warn('[AUTH] Handoff claim failed:', err);
      } finally {
        claimingRef.current = false;
      }
    };

    claimHandoff();
    const interval = window.setInterval(claimHandoff, 1500);
    const onVis = () => {
      if (document.visibilityState === 'visible') claimHandoff();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [fetchProfile]);

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
        updateSoundPreference,
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
