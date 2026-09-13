import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import api from '../utils/api';
import {
  synchronizeExistingPushSubscription,
  unsubscribeFromPushNotifications,
} from '../utils/push';

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  profilePictureUrl?: string;
  tenantId?: string;
  branchId?: string;
  impersonatedBy?: string;
  tenant?: {
    id: string;
    name: string;
    slug: string;
  };
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('tenantSlug');
    localStorage.removeItem('platformSession');
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    if (!localStorage.getItem('token')) {
      clearSession();
      return;
    }

    try {
      const response = await api.get('/profile');
      const updatedUser = response.data;
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    } catch (error: any) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        clearSession();
        return;
      }
      console.error('Failed to refresh user', error);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      let hasCachedUser = false;

      if (storedToken) {
        setToken(storedToken);
        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser));
            hasCachedUser = true;
            setIsLoading(false);
          } catch {
            localStorage.removeItem('user');
          }
        }

        // Fetch fresh user data
        try {
          const response = await api.get('/profile');
          setUser(response.data);
          localStorage.setItem('user', JSON.stringify(response.data));
        } catch (error: any) {
          const status = error.response?.status;
          if (status === 401 || status === 403) {
            clearSession();
          } else {
            console.error('Failed to fetch user profile', error);
          }
        }
      }
      if (!hasCachedUser) setIsLoading(false);
    };

    initAuth();
  }, []);

  useEffect(() => {
    if (!token || !user || user.role === 'PLATFORM_ADMIN') return;
    void synchronizeExistingPushSubscription();
  }, [token, user?.id, user?.tenantId, user?.role]);

  useEffect(() => {
    const handleInvalidAuth = () => {
      clearSession();
      setIsLoading(false);
    };

    window.addEventListener('app:auth-invalid', handleInvalidAuth);
    return () => window.removeEventListener('app:auth-invalid', handleInvalidAuth);
  }, []);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    if (newUser.role === 'PLATFORM_ADMIN') {
      localStorage.removeItem('tenantSlug');
    } else if (newUser.tenant?.slug) {
      localStorage.setItem('tenantSlug', newUser.tenant.slug);
    }
    setToken(newToken);
    setUser(newUser);
  };

  const logout = async () => {
    if (user?.role !== 'PLATFORM_ADMIN') {
      await unsubscribeFromPushNotifications();
    }
    clearSession();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        refreshUser,
        isAuthenticated: !!token && !!user,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
