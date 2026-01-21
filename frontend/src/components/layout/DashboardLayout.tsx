import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNav from './BottomNav';
import { FloatingActionButton } from '../mobile';

const DashboardLayout = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Pages where FAB should not appear
  const hideFABPaths = ['/communication', '/profile', '/settings'];
  const showFAB = !hideFABPaths.includes(location.pathname);

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-slate-900">
      {/* Sidebar - Hidden on mobile */}
      <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />

      {/* Header */}
      <Header />

      {/* Main Content */}
      <main
        className="md:pl-64 min-h-screen transition-all duration-300"
        style={{
          paddingTop: 'calc(4rem + env(safe-area-inset-top))',
          paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))',
        }}
      >
        <div className="max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Floating Action Button - Mobile only, context-aware */}
      {showFAB && <FloatingActionButton />}

      {/* Bottom Navigation - Mobile only */}
      <BottomNav onMenuClick={() => setIsMobileMenuOpen(true)} />
    </div>
  );
};

export default DashboardLayout;
