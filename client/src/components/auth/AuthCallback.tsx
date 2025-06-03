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
        const apiUrl = import.meta.env.PROD
          ? import.meta.env.VITE_PROD_API_URL
          : import.meta.env.VITE_API_URL;
        const response = await axios.get(`${apiUrl}/api/auth/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUser(response.data.user);
        navigate('/', { replace: true });
      } catch (error) {
        console.error('Error fetching profile:', error);
        localStorage.removeItem('token');
        navigate('/login', { replace: true });
      }
    };

    const token = searchParams.get('token');
    if (token) {
      localStorage.setItem('token', token);
      fetchUserProfile(token);
    } else {
      navigate('/login', { replace: true });
    }
  }, [searchParams, navigate, setUser]);

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