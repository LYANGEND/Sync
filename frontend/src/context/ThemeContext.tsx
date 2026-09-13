import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';
import { actionColors } from '../utils/themeColors';

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
  primaryColor: '#0047AB',
  secondaryColor: '#003366',
  accentColor: '#FF9933',
};

const THEME_CACHE_KEY = 'sync:theme-settings';

const getCachedSettings = (): ThemeSettings => {
  try {
    const cached = localStorage.getItem(THEME_CACHE_KEY);
    return cached ? { ...defaultSettings, ...JSON.parse(cached) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<ThemeSettings>(getCachedSettings);
  const [loading, setLoading] = useState(true);

  const refreshSettings = async () => {
    try {
      const response = await api.get('/settings/public');
      setSettings(response.data);
      localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(response.data));
      applyTheme(response.data);
    } catch (error) {
      console.error('Failed to fetch theme settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyTheme = (theme: ThemeSettings) => {
    const root = document.documentElement;
    const action = actionColors(theme.primaryColor);
    root.style.setProperty('--primary-color', theme.primaryColor);
    root.style.setProperty('--accent-color', theme.accentColor);
    root.style.setProperty('--action-color', action.background);
    root.style.setProperty('--action-hover', action.hover);
    root.style.setProperty('--action-foreground', action.foreground);
    root.style.setProperty('--primary-strong', action.hover);
    root.style.setProperty('--primary-dark', action.hover);
    
    // Update title
    document.title = theme.schoolName;
    
    // Update favicon if logoUrl exists (optional, might be tricky dynamically)
  };

  useEffect(() => {
    applyTheme(settings);
    refreshSettings();
  }, []);

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
