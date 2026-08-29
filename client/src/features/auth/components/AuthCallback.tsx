import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import axios from '../AuthContext/hooks/AxiosConfig';

/**
 * OAuth return with ?token= — stores JWT and loads profile.
 */
const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setUser } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserProfile = async (token: string) => {
      try {
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

          try {
            localStorage.setItem('userData', JSON.stringify(userData));
          } catch (storageError) {
            console.warn('Failed to store user data in localStorage:', storageError);
          }

          if (response.data.activeGame) {
            navigate(`/table/${response.data.activeGame.id}`, { replace: true });
          } else {
            navigate('/', { replace: true });
          }
        } else {
          localStorage.removeItem('sessionToken');
          navigate('/?signin=1', { replace: true });
        }
      } catch (err: any) {
        console.error('Error fetching profile after login:', err);
        localStorage.removeItem('sessionToken');
        setError('Login failed. Please try again.');
        navigate('/?signin=1', { replace: true });
      }
    };

    const token = searchParams.get('token');
    if (token) {
      try {
        localStorage.setItem('sessionToken', token);
      } catch {
        /* continue */
      }
      fetchUserProfile(token);
    } else {
      setError('No token received');
      navigate('/?signin=1', { replace: true });
    }
  }, [searchParams, navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-slate-200">
          {error || 'Completing login...'}
        </h2>
        <p className="mt-2 text-slate-400">Please wait while we redirect you.</p>
      </div>
    </div>
  );
};

export default AuthCallback;
