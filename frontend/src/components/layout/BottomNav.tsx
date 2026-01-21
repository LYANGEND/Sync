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
  GraduationCap,
  Bell
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';

interface BottomNavProps {
  onMenuClick: () => void;
}

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  roles: string[];
  badgeKey?: string;
}

const BottomNav = ({ onMenuClick }: BottomNavProps) => {
  const location = useLocation();
  const { user } = useAuth();
  const [badges, setBadges] = useState<Record<string, number>>({
    notifications: 0,
    messages: 0,
  });

  // Fetch badge counts
  useEffect(() => {
    const fetchBadges = async () => {
      try {
        const [notifResponse] = await Promise.all([
          api.get('/communication/notifications/unread-count').catch(() => ({ data: { count: 0 } })),
        ]);
        setBadges({
          notifications: notifResponse.data?.count || 0,
          messages: 0, // Could add unread messages count
        });
      } catch (error) {
        // Silently fail
      }
    };

    fetchBadges();
    const interval = setInterval(fetchBadges, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // Role-based navigation items
  const getNavItems = (): NavItem[] => {
    const role = user?.role;

    if (role === 'PARENT') {
      return [
        { icon: LayoutDashboard, label: 'Home', path: '/my-children', roles: ['PARENT'] },
        { icon: GraduationCap, label: 'Reports', path: '/my-children', roles: ['PARENT'] },
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

  // Haptic feedback helper
  const triggerHaptic = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(5);
    }
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-gray-200/50 dark:border-slate-700/50 z-50"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex justify-around items-stretch h-16">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const badge = item.badgeKey ? badges[item.badgeKey] : 0;

          return (
            <Link
              key={item.label}
              to={item.path}
              onClick={triggerHaptic}
              className={`flex flex-col items-center justify-center flex-1 relative group min-h-[48px] transition-all duration-200 ${isActive
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 dark:text-gray-400 active:text-gray-700 dark:active:text-gray-300'
                }`}
            >
              {/* Active Indicator */}
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-blue-600 rounded-b-full animate-scale-in" />
              )}

              {/* Icon with Badge */}
              <div className="relative">
                <item.icon
                  size={24}
                  strokeWidth={isActive ? 2.5 : 2}
                  className={`transition-transform duration-200 ${isActive ? 'scale-110' : 'group-active:scale-90'}`}
                />

                {/* Badge */}
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 animate-bounce-in">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </div>

              {/* Label */}
              <span className={`text-[10px] mt-1 font-medium transition-all duration-200 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                }`}>
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* Menu Button */}
        <button
          onClick={() => {
            triggerHaptic();
            onMenuClick();
          }}
          className="flex flex-col items-center justify-center flex-1 min-h-[48px] text-gray-500 dark:text-gray-400 active:text-gray-700 dark:active:text-gray-300 transition-all duration-200 group"
        >
          <div className="relative">
            <Menu
              size={24}
              strokeWidth={2}
              className="transition-transform duration-200 group-active:scale-90"
            />
            {/* Notification dot for unseen items */}
            {badges.notifications > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            )}
          </div>
          <span className="text-[10px] mt-1 font-medium text-gray-500 dark:text-gray-400">More</span>
        </button>
      </div>
    </nav>
  );
};

export default BottomNav;
