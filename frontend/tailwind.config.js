/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary-color)',
        // primary-hover: hover fill for solid primary buttons (bg-primary hover:bg-primary-hover).
        'primary-hover': 'var(--primary-hover)',
        secondary: 'var(--secondary-color)',
        accent: 'var(--accent-color)',
        // Standard hover backgrounds shared by every page. Light/dark values live in index.css.
        // surface-hover: rows, list items, menu items, ghost and icon buttons.
        // surface-hover-strong: secondary buttons and chips that already rest on a gray fill.
        // surface-hover-accent: outlined/ghost action buttons (edit, view, send). surface-hover-danger: outlined/ghost delete buttons.
        'surface-hover': 'var(--bg-hover)',
        'surface-hover-strong': 'var(--bg-hover-strong)',
        'surface-hover-accent': 'var(--bg-hover-accent)',
        'surface-hover-danger': 'var(--bg-hover-danger)',
      },
      spacing: {
        'header-safe': 'calc(4rem + env(safe-area-inset-top))',
        'nav-safe': 'calc(4rem + env(safe-area-inset-bottom))',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'bounce-in': {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '50%': { transform: 'scale(1.1)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'shimmer': 'shimmer 1.5s infinite',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-down': 'slide-down 0.3s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'bounce-in': 'bounce-in 0.3s ease-out',
      },
    },
  },
  plugins: [],
}
