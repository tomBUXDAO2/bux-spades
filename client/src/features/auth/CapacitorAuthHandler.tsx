import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import axios from './AuthContext/hooks/AxiosConfig';

/**
 * Handles buxspades://auth/callback deep links when app is opened from OAuth (Capacitor native only).
 * Must be mounted inside Router and AuthProvider.
 */
export const CapacitorAuthHandler: React.FC = () => {
  const navigate = useNavigate();
  const { setUser } = useAuth();

  useEffect(() => {
    const isCapacitor = () =>
      typeof (window as any).Capacitor !== 'undefined' && (window as any).Capacitor.isNativePlatform?.();
    if (!isCapacitor()) return;

    const completeAuth = async (token: string) => {
      try {
        const response = await axios.get('/api/auth/profile', {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        if (response.data?.user) {
          const userData = { ...response.data.user, sessionToken: token };
          setUser(userData);
          localStorage.setItem('sessionToken', token);
          localStorage.setItem('userData', JSON.stringify(userData));
          if (response.data.activeGame) {
            navigate(`/table/${response.data.activeGame.id}`, { replace: true });
          } else {
            navigate('/', { replace: true });
          }
        } else {
          navigate('/login', { replace: true });
        }
      } catch {
        navigate('/login', { replace: true });
      }
    };

    let listener: { remove: () => Promise<void> } | null = null;

    const processAuthUrl = async (url: string) => {
      if (!url.startsWith('buxspades://auth/callback')) return;
      try {
        const { Browser } = await import('@capacitor/browser');
        await Browser.close();
      } catch {}
      const u = new URL(url);
      const token = u.searchParams.get('token');
      const err = u.searchParams.get('error');
      if (err) {
        navigate('/login?error=oauth_failed', { replace: true });
        return;
      }
      if (token) {
        await completeAuth(token);
      }
    };

    const setup = async () => {
      try {
        const { App } = await import('@capacitor/app');
        const { Browser } = await import('@capacitor/browser');
        // Handle cold start: app launched via deep link
        const launchUrl = await App.getLaunchUrl();
        if (launchUrl?.url) {
          await processAuthUrl(launchUrl.url);
        }
        listener = await App.addListener('appUrlOpen', async (event: { url: string }) => {
          await processAuthUrl(event.url);
        });
      } catch (e) {
        console.warn('[CapacitorAuthHandler] Could not set up deep link listener:', e);
      }
    };

    setup();

    return () => {
      listener?.remove().catch(() => {});
    };
  }, [setUser, navigate]);

  return null;
};
