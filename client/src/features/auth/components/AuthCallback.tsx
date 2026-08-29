import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import axios from '../AuthContext/hooks/AxiosConfig';
import { AUTH_BROADCAST_CHANNEL, isStandalonePwa } from '../utils/displayMode';

const isCapacitor = () =>
  typeof (window as any).Capacitor !== 'undefined' && (window as any).Capacitor.isNativePlatform?.();

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setUser } = useAuth();
  const [returnToApp, setReturnToApp] = useState(false);

  useEffect(() => {
    const broadcastSession = (token: string, userData?: unknown) => {
      try {
        const bc = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
        bc.postMessage({ type: 'session', token, userData });
        bc.close();
      } catch {
        /* BroadcastChannel unsupported */
      }
    };

    const finishInApp = (activeGameId?: string) => {
      try {
        localStorage.removeItem('oauthFromPwa');
      } catch {
        /* ignore */
      }
      const openedOutsidePwa = !isStandalonePwa() && !isCapacitor();
      // OAuth from Android home-screen PWA often finishes in Chrome; keep that tab
      // as a "return to app" screen so the user doesn't stay in the browser lobby.
      if (openedOutsidePwa) {
        setReturnToApp(true);
        return;
      }
      if (activeGameId) {
        navigate(`/table/${activeGameId}`, { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    };

    const fetchUserProfile = async (token: string) => {
      try {
        console.log('Fetching profile with token:', token);
        const response = await axios.get('/api/auth/profile', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
        });

        if (response.data?.user) {
          console.log('Login successful:', response.data);
          const userData = {
            ...response.data.user,
            sessionToken: token
          };
          setUser(userData);

          try {
            localStorage.setItem('userData', JSON.stringify(userData));
          } catch (storageError) {
            console.warn('Failed to store user data in localStorage (quota exceeded):', storageError);
            try {
              localStorage.clear();
              localStorage.setItem('sessionToken', token);
              localStorage.setItem('userData', JSON.stringify(userData));
            } catch (retryError) {
              console.error('Failed to store user data even after clearing localStorage:', retryError);
              try {
                const essentialData = {
                  id: userData.id,
                  username: userData.username,
                  sessionToken: userData.sessionToken
                };
                localStorage.setItem('userData', JSON.stringify(essentialData));
              } catch (finalError) {
                console.error('Failed to store even essential user data:', finalError);
              }
            }
          }

          broadcastSession(token, userData);
          finishInApp(response.data.activeGame?.id);
        } else {
          console.error('Invalid profile response:', response.data);
          localStorage.removeItem('sessionToken');
          navigate('/?signin=1', { replace: true });
        }
      } catch (error: any) {
        console.error('Error fetching profile after login:', error);
        localStorage.removeItem('sessionToken');
        navigate('/?signin=1', { replace: true });
      }
    };

    const token = searchParams.get('token');
    if (token) {
      console.log('Callback received token:', token);

      try {
        localStorage.setItem('sessionToken', token);
      } catch (storageError) {
        console.warn('Failed to store session token in localStorage (quota exceeded):', storageError);
        try {
          localStorage.clear();
          localStorage.setItem('sessionToken', token);
        } catch (retryError) {
          console.error('Failed to store session token even after clearing localStorage:', retryError);
        }
      }

      broadcastSession(token);
      fetchUserProfile(token);
    } else {
      console.error('No token received from callback');
      navigate('/?signin=1', { replace: true });
    }
  }, [searchParams, navigate, setUser]);

  if (returnToApp) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 px-6">
        <div className="max-w-md text-center">
          <h2 className="text-2xl font-semibold text-slate-100">You&apos;re signed in</h2>
          <p className="mt-3 text-slate-300 leading-relaxed">
            Facebook opened in your browser instead of the app. Close this tab and open{' '}
            <strong className="text-white">BUX Spades</strong> from your home screen icon to continue.
          </p>
          <a
            href="/"
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-md"
          >
            Try opening the app
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-slate-200">Completing login...</h2>
        <p className="mt-2 text-slate-400">Please wait while we redirect you.</p>
      </div>
    </div>
  );
};

export default AuthCallback;
