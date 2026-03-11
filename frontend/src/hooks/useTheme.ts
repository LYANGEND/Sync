import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeConfig {
    theme: Theme;
    isDark: boolean;
    setTheme: (theme: Theme) => void;
    toggleTheme: () => void;
}

/**
 * useTheme Hook
 * Provides dark mode support with system preference detection
 */
export const useTheme = (): ThemeConfig => {
    const [theme, setThemeState] = useState<Theme>(() => {
        if (typeof window === 'undefined') return 'system';
        return (localStorage.getItem('theme') as Theme) || 'system';
    });

    const [isDark, setIsDark] = useState(false);

    // Get system preference
    const getSystemPreference = useCallback((): boolean => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }, []);

    // Update dark mode based on theme setting
    const updateDarkMode = useCallback((currentTheme: Theme) => {
        const shouldBeDark = currentTheme === 'dark' ||
            (currentTheme === 'system' && getSystemPreference());

        setIsDark(shouldBeDark);

        // Update document class
        if (shouldBeDark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }

        // Update meta theme-color
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) {
            metaTheme.setAttribute('content', shouldBeDark ? '#0F2471' : '#1A3A9C');
        }
    }, [getSystemPreference]);

    // Set theme
    const setTheme = useCallback((newTheme: Theme) => {
        setThemeState(newTheme);
        localStorage.setItem('theme', newTheme);
        updateDarkMode(newTheme);
    }, [updateDarkMode]);

    // Toggle between light and dark
    const toggleTheme = useCallback(() => {
        const newTheme = isDark ? 'light' : 'dark';
        setTheme(newTheme);
    }, [isDark, setTheme]);

    // Initialize and listen for system preference changes
    useEffect(() => {
        updateDarkMode(theme);

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
            if (theme === 'system') {
                updateDarkMode('system');
            }
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme, updateDarkMode]);

    return { theme, isDark, setTheme, toggleTheme };
};

export default useTheme;
