import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setUser } = useAuth();

  useEffect(() => {
    const fetchUserProfile = async (token: string) => {
      try {
        console.log('Fetching profile with Discord token:', token);
        const response = await axios.get('/api/auth/profile', {
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
        });
        
        if (response.data?.user) {
          console.log('Discord login successful:', response.data);
          const userData = {
            ...response.data.user,
            sessionToken: token
          };
          setUser(userData);
          localStorage.setItem('userData', JSON.stringify(userData));
          navigate('/', { replace: true });
        } else {
          console.error('Invalid profile response:', response.data);
          localStorage.removeItem('sessionToken');
          navigate('/login', { replace: true });
        }
      } catch (error: any) {
        console.error('Error fetching profile after Discord login:', error);
        localStorage.removeItem('sessionToken');
        navigate('/login', { replace: true });
      }
    };

    const token = searchParams.get('token');
    if (token) {
      console.log('Discord callback received token:', token);
      localStorage.setItem('sessionToken', token);
      fetchUserProfile(token);
    } else {
      console.error('No token received in Discord callback');
      navigate('/login', { replace: true });
    }
  }, [searchParams, navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-slate-200">Completing Discord login...</h2>
        <p className="mt-2 text-slate-400">Please wait while we redirect you.</p>
      </div>
    </div>
  );
};

export default AuthCallback; 