import { useLayoutEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNav from './BottomNav';
import { FloatingActionButton } from '../mobile';
import GlobalVoiceCommand from '../voice/GlobalVoiceCommand';

const SIDEBAR_COLLAPSED_KEY = 'sync.sidebar.collapsed';

const getInitialSidebarCollapsed = () => {
  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
};

const DashboardLayout = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(getInitialSidebarCollapsed);
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();

  const handleSidebarToggle = () => {
    setIsSidebarCollapsed((current) => {
      const next = !current;

      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // The preference is optional when storage is unavailable.
      }

      return next;
    });
  };

  useLayoutEffect(() => {
    const root = document.documentElement;
    const previousScrollbarGutter = root.style.scrollbarGutter;

    // Keep page width fixed while short and long route states swap in.
    root.style.scrollbarGutter = 'stable';

    return () => {
      root.style.scrollbarGutter = previousScrollbarGutter;
    };
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;

    // Reset before paint so a new route never appears at the previous page's offset.
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    root.style.scrollBehavior = previousScrollBehavior;
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Pages where FAB should not appear
  const hideFABPaths = ['/communication', '/profile', '/settings', '/data-management'];
  const showFAB = !hideFABPaths.includes(location.pathname);
  const showGlobalVoiceCommand = !location.pathname.startsWith('/data-management');

  return (
    <div className="min-h-screen min-h-dvh overflow-x-clip bg-gray-50/50 dark:bg-slate-900">
      {/* Sidebar - Hidden on mobile */}
      <Sidebar
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleSidebarToggle}
      />

      {/* Header */}
      <Header isSidebarCollapsed={isSidebarCollapsed} />

      {/* Main Content */}
      <main
        className={`min-h-screen min-h-dvh transition-[padding-left] duration-200 ease-out ${isSidebarCollapsed ? 'md:pl-20' : 'md:pl-64'}`}
        style={{
          paddingTop: 'calc(4rem + env(safe-area-inset-top))',
          paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))',
        }}
      >
        <div
          className="mx-auto max-w-7xl"
          style={{
            minHeight: 'calc(100dvh - 8rem - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
          }}
        >
          <motion.div
            key={location.pathname}
            initial={shouldReduceMotion ? false : { opacity: 0.82 }}
            animate={{ opacity: 1 }}
            transition={shouldReduceMotion
              ? { duration: 0 }
              : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
          </motion.div>
        </div>
      </main>

      {/* Floating Action Button - Mobile only, context-aware */}
      {showFAB && <FloatingActionButton />}

      {/* Keep sensitive data-transfer controls free of floating overlays. */}
      {showGlobalVoiceCommand && <GlobalVoiceCommand />}

      {/* Bottom Navigation - Mobile only */}
      <BottomNav onMenuClick={() => setIsMobileMenuOpen(true)} />
    </div>
  );
};

export default DashboardLayout;
