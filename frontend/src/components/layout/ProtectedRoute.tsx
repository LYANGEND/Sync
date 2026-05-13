import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ProtectedRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (isAuthenticated) {
    return <Outlet />;
  }

  const loginPath = location.pathname.startsWith('/ops') ? '/ops/login' : '/login';
  return <Navigate to={loginPath} replace />;
};

export default ProtectedRoute;
