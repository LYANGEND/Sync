import React, { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  MessageSquare,
  Menu,
  User,
  Users,
  Wallet,
  ShieldCheck,
  TrendingUp
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface BottomNavProps {
  onMenuClick: () => void;
  isMenuOpen?: boolean;
}

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  roles: string[];
  badgeKey?: string;
}

const BottomNav = ({ onMenuClick, isMenuOpen = false }: BottomNavProps) => {
  const location = useLocation();
  const { user } = useAuth();
  const [badges, setBadges] = useState<Record<string, number>>({
    notifications: 0,
    messages: 0,
  });

  useEffect(() => {
    const handleNotificationCount = (event: Event) => {
      const count = (event as CustomEvent<number>).detail || 0;
      setBadges((current) => ({ ...current, notifications: count }));
    };

    window.addEventListener('app:notifications-count', handleNotificationCount);
    return () => window.removeEventListener('app:notifications-count', handleNotificationCount);
  }, []);

  // Role-based navigation items
  const getNavItems = (): NavItem[] => {
    const role = user?.role;

    if (role === 'PARENT') {
      return [
        { icon: LayoutDashboard, label: 'Home', path: '/my-children', roles: ['PARENT'] },
        { icon: TrendingUp, label: 'Progress', path: '/academics/progress', roles: ['PARENT'] },
        { icon: MessageSquare, label: 'Chat', path: '/communication', roles: ['PARENT'], badgeKey: 'messages' },
        { icon: User, label: 'Profile', path: '/profile', roles: ['PARENT'] },
      ];
    }

    if (role === 'TEACHER') {
      return [
        { icon: LayoutDashboard, label: 'Home', path: '/', roles: ['TEACHER'] },
        { icon: BookOpen, label: 'Classes', path: '/academics', roles: ['TEACHER'] },
        { icon: MessageSquare, label: 'Chat', path: '/communication', roles: ['TEACHER'], badgeKey: 'messages' },
        { icon: User, label: 'Profile', path: '/profile', roles: ['TEACHER'] },
      ];
    }

    if (role === 'PLATFORM_ADMIN') {
      return [
        { icon: ShieldCheck, label: 'Ops', path: '/ops/tenants', roles: ['PLATFORM_ADMIN'] },
        { icon: User, label: 'Profile', path: '/profile', roles: ['PLATFORM_ADMIN'] },
      ];
    }

    // Admin, Bursar, Secretary
    return [
      { icon: LayoutDashboard, label: 'Home', path: '/', roles: ['SUPER_ADMIN', 'BURSAR', 'SECRETARY'] },
      { icon: Users, label: 'Students', path: '/students', roles: ['SUPER_ADMIN', 'BURSAR', 'SECRETARY'] },
      { icon: Wallet, label: 'Finance', path: '/finance', roles: ['SUPER_ADMIN', 'BURSAR'] },
      { icon: MessageSquare, label: 'Chat', path: '/communication', roles: ['SUPER_ADMIN', 'BURSAR', 'SECRETARY'], badgeKey: 'messages' },
    ];
  };

  const navItems = useMemo(() => {
    return getNavItems().filter(item =>
      user && item.roles.includes(user.role)
    );
  }, [user?.role]);

  const activePath = navItems
    .filter(item => location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(`${item.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path;

  // Haptic feedback helper
  const triggerHaptic = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(5);
    }
  };

  return (
    <nav
      aria-label="Mobile navigation"
      className="ds-header md:hidden fixed bottom-0 left-0 right-0 z-50 border-t text-[var(--text-secondary)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div>
        <div className="flex justify-around items-stretch h-16 px-1">
          {navItems.map((item) => {
            const isActive = item.path === activePath;
            const badge = item.badgeKey ? badges[item.badgeKey] : 0;

            return (
              <Link
                key={item.label}
                to={item.path}
                aria-current={isActive ? 'page' : undefined}
                aria-label={badge > 0 ? `${item.label}, ${badge} unread` : undefined}
                onClick={triggerHaptic}
                className="flex min-w-0 flex-col items-center justify-center flex-1 relative group min-h-[48px] rounded-xl transition-colors duration-200"
              >
                {/* Pill background for active */}
                {isActive && (
                  <div
                    className="absolute inset-x-2 top-2 bottom-2 rounded-2xl"
                    style={{ background: 'color-mix(in srgb, var(--action-color) 9%, var(--surface))' }}
                    aria-hidden="true"
                  />
                )}

                {/* Icon with Badge */}
                <div className="relative z-10">
                  <item.icon
                    size={22}
                    aria-hidden="true"
                    strokeWidth={isActive ? 2.5 : 1.8}
                    style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                  />
                  {badge > 0 && (
                    <span aria-hidden="true" className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] bg-red-600 text-white text-[9px] font-black rounded-full flex items-center justify-center px-1">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </div>

                {/* Label */}
                <span
                  className="relative z-10 text-xs mt-0.5 font-semibold"
                  style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* More / Menu */}
          <button
            type="button"
            aria-label="Open navigation menu"
            aria-expanded={isMenuOpen}
            aria-controls="primary-sidebar"
            aria-haspopup="dialog"
            onClick={() => { triggerHaptic(); onMenuClick(); }}
            className="flex flex-col items-center justify-center flex-1 min-h-[48px] rounded-xl text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] transition-colors duration-200 group relative"
          >
            <div className="relative">
              <Menu size={22} strokeWidth={1.8} aria-hidden="true" />
              {badges.notifications > 0 && (
                <span aria-hidden="true" className="absolute -top-1 -right-1 w-2 h-2 bg-red-600 rounded-full" />
              )}
            </div>
            <span className="text-xs mt-0.5 font-semibold">More</span>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default BottomNav;
