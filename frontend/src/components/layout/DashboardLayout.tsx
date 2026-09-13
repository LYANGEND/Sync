import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNav from './BottomNav';
import { FloatingActionButton } from '../mobile';
import GlobalVoiceCommand from '../voice/GlobalVoiceCommand';

const DashboardLayout = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Pages where FAB should not appear
  const hideFABPaths = ['/communication', '/profile', '/settings'];
  const showFAB = !hideFABPaths.includes(location.pathname);

  return (
    <div className="app-shell min-h-screen">
      <a id="dashboard-skip-link" href="#main-content" className="ds-skip-link"
        onClick={() => document.getElementById('main-content')?.focus()}>
        Skip to main content
      </a>
      {/* Sidebar - Hidden on mobile */}
      <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />

      <div id="dashboard-content">
        {/* Header */}
        <Header />

        {/* Main Content */}
        <main
          id="main-content"
          tabIndex={-1}
          className="app-main md:pl-[17.5rem] min-h-screen"
          style={{
            paddingTop: 'calc(4rem + env(safe-area-inset-top))',
            paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))',
          }}
        >
          <div className="ds-shell py-4 sm:py-6 lg:py-8">
            <div key={location.pathname} className="route-enter">
              <Outlet />
            </div>
          </div>
        </main>

        {/* Floating Action Button - Mobile only, context-aware */}
        {showFAB && <FloatingActionButton />}

        {/* Global Voice Command - available on all pages */}
        <GlobalVoiceCommand />

        {/* Bottom Navigation - Mobile only */}
        <BottomNav isMenuOpen={isMobileMenuOpen} onMenuClick={() => setIsMobileMenuOpen(true)} />
      </div>
    </div>
  );
};

export default DashboardLayout;
