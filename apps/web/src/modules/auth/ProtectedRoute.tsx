import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { LoadingState } from '../../design-system';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingState message="Authenticating..." />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
