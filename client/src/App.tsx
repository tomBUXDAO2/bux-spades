import React, { useEffect, useState } from 'react';
import { 
  RouterProvider,
  createBrowserRouter,
  Navigate,
} from 'react-router-dom';
import { AuthProvider as AuthContextProvider, useAuth } from '@/features/auth/AuthContext';
import Login from '@/features/auth/components/Login';
import Register from '@/features/auth/components/Register';
import AuthCallback from '@/features/auth/components/AuthCallback';
import HomePage from '@/features/lobby/HomePage';
import TablePage from './pages/TablePage';
import TestTablePage from './pages/TestTablePage';
import FacebookVerification from './pages/FacebookVerification';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import TournamentLobby from '@/features/tournament/TournamentLobby';
import { SocketProvider } from '@/features/auth/SocketContext';
import SessionInvalidatedModal from './components/modals/SessionInvalidatedModal';
import ForceLogoutModal from './components/modals/ForceLogoutModal';
import PWAInstallModal from './components/modals/PWAInstallModal';
import { usePWAInstall } from './hooks/usePWAInstall';
import { preloadImages } from './services/utils/imagePreloader';

// Placeholder components - these will be implemented later
const Profile = () => <div>Profile Page</div>;
const Game = () => <div>Game Page</div>;

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    // Show a loading spinner or blank screen while checking auth
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-white">Loading...</h2>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  return <>{children}</>;
};

const router = createBrowserRouter(
  [
    {
      path: "/",
      children: [
        {
          path: "login",
          element: <Login />
        },
        {
          path: "register",
          element: <Register />
        },
        {
          path: "auth/callback",
          element: <AuthCallback />
        },
        {
          path: "facebook-verification",
          element: <FacebookVerification />
        },
        {
          path: "privacy",
          element: <PrivacyPolicy />
        },
        {
          path: "terms",
          element: <TermsOfService />
        },
        {
          path: "",
          element: <ProtectedRoute><HomePage /></ProtectedRoute>
        },
        {
          path: "profile",
          element: <ProtectedRoute><Profile /></ProtectedRoute>
        },
        {
          path: "game/:id",
          element: <ProtectedRoute><Game /></ProtectedRoute>
        },
        {
          path: "table/:gameId",
          element: <ProtectedRoute><TablePage /></ProtectedRoute>
        },
        {
          path: "test-table",
          element: <ProtectedRoute><TestTablePage /></ProtectedRoute>
        },
        {
          path: "tournament/:tournamentId",
          element: <TournamentLobby />
        },
        {
          path: "*",
          element: <Navigate to="/" />
        }
      ]
    }
  ],
  {
    future: {
      v7_relativeSplatPath: true
    }
  }
);

const AppWithSocket: React.FC = () => {
  const { showSessionInvalidatedModal, setShowSessionInvalidatedModal } = useAuth();
  const { showInstallPrompt, dismissPrompt } = usePWAInstall();
  const [showForceLogoutModal, setShowForceLogoutModal] = useState(false);
  
  // Preload images on app start
  useEffect(() => {
    preloadImages();
  }, []);
  
  // Listen for force logout event
  useEffect(() => {
    const handleForceLogout = () => {
      console.log('[APP] Force logout event received');
      setShowForceLogoutModal(true);
    };
    
    window.addEventListener('forceLogout', handleForceLogout);
    
    return () => {
      window.removeEventListener('forceLogout', handleForceLogout);
    };
  }, []);
  
  return (
    <SocketProvider>
      <RouterProvider router={router} />
      <SessionInvalidatedModal
        isOpen={showSessionInvalidatedModal}
        onClose={() => {
          setShowSessionInvalidatedModal(false);
          window.location.href = '/login';
        }}
        onLogin={() => {
          setShowSessionInvalidatedModal(false);
          window.location.href = '/login';
        }}
      />
      <ForceLogoutModal
        isOpen={showForceLogoutModal}
        onClose={() => {
          setShowForceLogoutModal(false);
          window.location.href = '/login';
        }}
      />
      <PWAInstallModal
        isOpen={showInstallPrompt}
        onClose={dismissPrompt}
      />
    </SocketProvider>
  );
};

const App: React.FC = () => {
  return (
    <AuthContextProvider>
      <AppWithSocket />
    </AuthContextProvider>
  );
};

export default App; 