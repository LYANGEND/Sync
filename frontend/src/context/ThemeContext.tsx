import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

interface ThemeSettings {
  schoolName: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

interface ThemeContextType {
  settings: ThemeSettings;
  refreshSettings: () => Promise<void>;
  loading: boolean;
}

const defaultSettings: ThemeSettings = {
  schoolName: 'My School',
  primaryColor: '#2563eb',
  secondaryColor: '#475569',
  accentColor: '#f59e0b',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<ThemeSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  const applyTheme = useCallback((theme: ThemeSettings) => {
    const root = document.documentElement;
    root.style.setProperty('--primary-color', theme.primaryColor);
    root.style.setProperty('--secondary-color', theme.secondaryColor);
    root.style.setProperty('--accent-color', theme.accentColor);

    // Update title
    document.title = theme.schoolName || 'School Management';
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      // The backend will use the JWT token (if present) to determine tenant
      const response = await api.get('/settings/public');
      const data = response.data;

      // Normalize the response to match our interface
      const normalizedSettings: ThemeSettings = {
        schoolName: data.schoolName || data.name || 'My School',
        logoUrl: data.logoUrl,
        primaryColor: data.primaryColor || '#2563eb',
        secondaryColor: data.secondaryColor || '#475569',
        accentColor: data.accentColor || '#f59e0b',
      };

      setSettings(normalizedSettings);
      applyTheme(normalizedSettings);
    } catch (error) {
      console.error('Failed to fetch theme settings:', error);
    } finally {
      setLoading(false);
    }
  }, [applyTheme]);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  // Listen for storage events to refresh settings on login/logout
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'token') {
        // Token changed (login/logout), refresh settings
        refreshSettings();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [refreshSettings]);

  return (
    <ThemeContext.Provider value={{ settings, refreshSettings, loading }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
