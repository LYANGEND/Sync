import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, BookOpen, MessageSquare, Menu, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface BottomNavProps {
  onMenuClick: () => void;
}

const BottomNav = ({ onMenuClick }: BottomNavProps) => {
  const location = useLocation();
  const { user } = useAuth();

  const navItems = [
    { 
      icon: LayoutDashboard, 
      label: 'Home', 
      path: '/', 
      roles: ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY'] 
    },
    { 
      icon: BookOpen, 
      label: 'Academics', 
      path: '/academics', 
      roles: ['SUPER_ADMIN', 'TEACHER'] 
    },
    { 
      icon: MessageSquare, 
      label: 'Chat', 
      path: '/communication', 
      roles: ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY', 'PARENT'] 
    },
    { 
      icon: User, 
      label: 'Profile', 
      path: '/profile', 
      roles: ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY', 'PARENT'] 
    },
  ];

  const filteredItems = navItems.filter(item => 
    user && item.roles.includes(user.role)
  );

  return (
    <div 
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 flex justify-around items-center z-40 transition-all duration-300"
      style={{ 
        paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))',
        paddingTop: '0.5rem',
        height: 'auto'
      }}
    >
      {filteredItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <Link
            key={item.label}
            to={item.path}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 rounded-lg active:scale-95 transition-transform ${
              isActive ? 'text-blue-600' : 'text-gray-500'
            }`}
          >
            <item.icon size={24} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
      <button
        onClick={onMenuClick}
        className="flex flex-col items-center justify-center w-full h-full space-y-1 text-gray-500 rounded-lg active:scale-95 transition-transform"
      >
        <Menu size={24} />
        <span className="text-[10px] font-medium">Menu</span>
      </button>
    </div>
  );
};

export default BottomNav;
