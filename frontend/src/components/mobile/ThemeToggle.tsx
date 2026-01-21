import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { hapticLight } from '../../utils/haptic';

interface ThemeToggleProps {
    showLabel?: boolean;
    className?: string;
}

/**
 * ThemeToggle Component
 * Button to toggle between light, dark, and system themes
 */
export const ThemeToggle: React.FC<ThemeToggleProps> = ({
    showLabel = false,
    className = '',
}) => {
    const { theme, isDark, toggleTheme, setTheme } = useTheme();

    const handleToggle = () => {
        hapticLight();
        toggleTheme();
    };

    return (
        <button
            onClick={handleToggle}
            className={`p-2.5 rounded-xl transition-all duration-200 ${isDark
                    ? 'bg-gray-700 text-yellow-400 hover:bg-gray-600'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                } ${className}`}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
            <div className="flex items-center gap-2">
                {isDark ? <Moon size={20} /> : <Sun size={20} />}
                {showLabel && (
                    <span className="text-sm font-medium">
                        {isDark ? 'Dark' : 'Light'}
                    </span>
                )}
            </div>
        </button>
    );
};

interface ThemeSelectorProps {
    className?: string;
}

/**
 * ThemeSelector Component
 * Full theme selector with all three options
 */
export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
    className = '',
}) => {
    const { theme, setTheme } = useTheme();

    const themes = [
        { value: 'light' as const, icon: Sun, label: 'Light' },
        { value: 'dark' as const, icon: Moon, label: 'Dark' },
        { value: 'system' as const, icon: Monitor, label: 'System' },
    ];

    const handleSelect = (value: 'light' | 'dark' | 'system') => {
        hapticLight();
        setTheme(value);
    };

    return (
        <div className={`flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 ${className}`}>
            {themes.map(({ value, icon: Icon, label }) => (
                <button
                    key={value}
                    onClick={() => handleSelect(value)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg transition-all duration-200 ${theme === value
                            ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600 dark:text-blue-400'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                >
                    <Icon size={16} />
                    <span className="text-sm font-medium">{label}</span>
                </button>
            ))}
        </div>
    );
};

export default ThemeToggle;
