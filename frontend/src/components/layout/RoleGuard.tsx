import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AppLoadingScreen from '../ui/AppLoadingScreen';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: string[];
}

const RoleGuard: React.FC<RoleGuardProps> = ({ children, allowedRoles }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <AppLoadingScreen compact />;
  }

  if (!user || !allowedRoles.includes(user.role)) {
    // Redirect to dashboard if logged in but unauthorized, or login if not logged in
    return <Navigate to={user ? "/" : "/login"} replace />;
  }

  return <>{children}</>;
};

export default RoleGuard;
