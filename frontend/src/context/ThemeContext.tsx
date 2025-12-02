import React, { createContext, useContext, useState, useEffect } from 'react';
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

  const refreshSettings = async () => {
    try {
      const response = await api.get('/settings/public');
      setSettings(response.data);
      applyTheme(response.data);
    } catch (error) {
      console.error('Failed to fetch theme settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyTheme = (theme: ThemeSettings) => {
    const root = document.documentElement;
    root.style.setProperty('--primary-color', theme.primaryColor);
    root.style.setProperty('--secondary-color', theme.secondaryColor);
    root.style.setProperty('--accent-color', theme.accentColor);
    
    // Update title
    document.title = theme.schoolName;
    
    // Update favicon if logoUrl exists (optional, might be tricky dynamically)
  };

  useEffect(() => {
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
