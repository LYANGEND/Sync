import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, CreditCard, CalendarCheck, MoreHorizontal } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const BottomNav = () => {
  const location = useLocation();
  const { user } = useAuth();

  // Define nav items based on role
  const getNavItems = () => {
    const role = user?.role || '';
    
    const baseItems = [
      { icon: LayoutDashboard, label: 'Home', path: '/', roles: ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY'] },
      { icon: Users, label: 'Students', path: '/students', roles: ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY'] },
      { icon: CreditCard, label: 'Finance', path: '/finance', roles: ['SUPER_ADMIN', 'BURSAR'] },
      { icon: CalendarCheck, label: 'Attendance', path: '/attendance', roles: ['SUPER_ADMIN', 'TEACHER', 'SECRETARY'] },
      { icon: MoreHorizontal, label: 'More', path: '/more', roles: ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY', 'PARENT'] },
    ];

    return baseItems.filter(item => item.roles.includes(role)).slice(0, 5);
  };

  const navItems = getNavItems();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    if (path === '/more') {
      return ['/academics', '/users', '/settings', '/communication', '/classes', '/subjects'].some(p => location.pathname.startsWith(p));
    }
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 lg:hidden z-30 safe-area-bottom">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const active = isActive(item.path);
          const Icon = item.icon;
          
          // Handle "More" specially - it opens a different view
          const linkPath = item.path === '/more' ? '/settings' : item.path;
          
          return (
            <Link
              key={item.label}
              to={linkPath}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                active 
                  ? 'text-blue-600' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              <span className={`text-[10px] mt-1 ${active ? 'font-semibold' : 'font-medium'}`}>
                {item.label}
              </span>
              {active && (
                <div className="absolute bottom-0 w-12 h-0.5 bg-blue-600 rounded-t-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
