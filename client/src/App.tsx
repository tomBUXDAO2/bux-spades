import React from 'react';
import { 
  RouterProvider,
  createBrowserRouter,
  Navigate,
} from 'react-router-dom';
import { AuthProvider as AuthContextProvider, useAuth } from '@/context/AuthContext';
import Login from '@/components/auth/Login';
import Register from '@/components/auth/Register';
import AuthCallback from '@/components/auth/AuthCallback';
import HomePage from './pages/HomePage';
import TablePage from './pages/TablePage';
import { SocketProvider } from './context/SocketContext';

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
          path: "*",
          element: <Navigate to="/" />
        }
      ]
    }
  ],
  {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true
    }
  }
);

const AppWithSocket: React.FC = () => {
  return (
    <SocketProvider>
      <RouterProvider router={router} />
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